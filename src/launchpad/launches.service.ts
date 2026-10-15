import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Page, pageArgs } from '../common/pagination.js';
import type { Env } from '../config/env.js';
import type { EvmChainConfig } from '../config/evm-chains.js';
import type {
  Launch,
  LaunchContribution,
  Prisma,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UploadsService } from '../uploads/uploads.service.js';
import { toUserSummary, type UserSummary } from '../users/user-profile.js';
import {
  ListLaunchesQueryDto,
  type LaunchStatusFilter,
} from './dto/list-launches-query.dto.js';
import { UpdateLaunchDto } from './dto/update-launch.dto.js';
import {
  type ChainView,
  type LaunchView,
  toChainView,
  toLaunchView,
} from './launch-view.js';
import { type TokenList, toTokenList } from './token-list.js';

/**
 * The three filters of the front as conditions on the stored rows. A launch
 * changes group as time passes, so they compare against the current time.
 */
function statusCondition(
  status: LaunchStatusFilter,
  now: Date,
): Prisma.LaunchWhereInput {
  const open = { finalizedAt: null, hardCapReachedAt: null, cancelledAt: null };
  if (status === 'upcoming') return { ...open, startTime: { gt: now } };
  if (status === 'live') {
    return { ...open, startTime: { lte: now }, endTime: { gt: now } };
  }
  return {
    OR: [
      { finalizedAt: { not: null } },
      { hardCapReachedAt: { not: null } },
      { cancelledAt: { not: null } },
      { endTime: { lte: now } },
    ],
  };
}

@Injectable()
export class LaunchesService {
  private readonly chains: Map<string, EvmChainConfig>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    config: ConfigService<Env, true>,
  ) {
    const chains = config.get('EVM_CHAINS', { infer: true });
    this.chains = new Map(chains.map((chain) => [chain.key, chain]));
  }

  /** The chains launches can be created on. */
  listChains(): { items: ChainView[] } {
    return { items: [...this.chains.values()].map(toChainView) };
  }

  /** Launches of the configured chains, the most recently created first. */
  async list(
    query: ListLaunchesQueryDto,
    viewerId?: string,
  ): Promise<Page<LaunchView>> {
    const now = new Date();
    const rows = await this.prisma.launch.findMany({
      where: {
        // A chain taken out of the configuration stops being shown.
        chainKey: query.chain ?? { in: [...this.chains.keys()] },
        creatorAddress: query.creator,
        ...(query.status ? statusCondition(query.status, now) : {}),
        ...(query.q
          ? {
              AND: {
                OR: [
                  { name: { contains: query.q, mode: 'insensitive' } },
                  { symbol: { contains: query.q, mode: 'insensitive' } },
                ],
              },
            }
          : {}),
      },
      ...pageArgs(query),
    });

    const pageRows = rows.slice(0, query.limit);
    const views = await this.toViews(pageRows, viewerId, now);
    return {
      items: views,
      nextCursor:
        rows.length > query.limit ? pageRows[pageRows.length - 1].id : null,
    };
  }

  /** The tokens of every listed launch, in the token list format. */
  async tokenList(): Promise<TokenList> {
    const launches = await this.prisma.launch.findMany({
      where: {
        chainKey: { in: [...this.chains.keys()] },
        finalizedAt: { not: null },
      },
      orderBy: [{ finalizedAt: 'asc' }, { id: 'asc' }],
      select: {
        chainKey: true,
        tokenAddress: true,
        name: true,
        symbol: true,
        imageUrl: true,
      },
    });
    return toTokenList(
      launches.map((launch) => ({
        ...launch,
        chainId: this.chains.get(launch.chainKey)!.chainId,
      })),
      new Date(),
    );
  }

  async get(id: string, viewerId?: string): Promise<LaunchView> {
    const launch = await this.findConfigured(id);
    const [view] = await this.toViews([launch], viewerId, new Date());
    return view;
  }

  /** Only the user who holds the wallet that created the launch can edit it. */
  async update(
    id: string,
    userId: string,
    dto: UpdateLaunchDto,
  ): Promise<LaunchView> {
    const launch = await this.findConfigured(id);
    const wallets = await this.evmWalletsOf(userId);
    if (!wallets.includes(launch.creatorAddress)) {
      throw new ForbiddenException('Only the creator can edit a launch');
    }

    if (dto.image !== undefined && dto.image !== launch.imageUrl) {
      await this.setImage(launch, dto.image);
    }
    if (dto.description !== undefined) {
      await this.prisma.launch.update({
        where: { id },
        data: { description: dto.description },
      });
    }
    return this.get(id, userId);
  }

  /** The image is set once, only to a file uploaded to this API. */
  private async setImage(launch: Launch, url: string): Promise<void> {
    if (launch.imageUrl) {
      throw new ConflictException('The image of a launch cannot be changed');
    }
    if (!(await this.uploads.storedNameOf(url))) {
      throw new BadRequestException(
        'image must be an image uploaded to Somewhere',
      );
    }
    // Conditional, so two requests at once cannot both set it
    const { count } = await this.prisma.launch.updateMany({
      where: { id: launch.id, imageUrl: null },
      data: { imageUrl: url },
    });
    if (count === 0) {
      throw new ConflictException('The image of a launch cannot be changed');
    }
  }

  private async findConfigured(id: string): Promise<Launch> {
    const launch = await this.prisma.launch.findUnique({ where: { id } });
    if (!launch || !this.chains.has(launch.chainKey)) {
      throw new NotFoundException('Launch not found');
    }
    return launch;
  }

  private async evmWalletsOf(userId: string): Promise<string[]> {
    const wallets = await this.prisma.wallet.findMany({
      where: { userId, family: 'evm' },
      select: { address: true },
    });
    return wallets.map((wallet) => wallet.address);
  }

  private async toViews(
    launches: Launch[],
    viewerId: string | undefined,
    now: Date,
  ): Promise<LaunchView[]> {
    if (launches.length === 0) return [];

    // Creators that are users of Somewhere, by their wallet.
    const creatorWallets = await this.prisma.wallet.findMany({
      where: {
        family: 'evm',
        address: { in: launches.map((launch) => launch.creatorAddress) },
      },
      include: { user: true },
    });
    const userByAddress = new Map<string, UserSummary>(
      creatorWallets.map((wallet) => [
        wallet.address,
        toUserSummary(wallet.user),
      ]),
    );

    const mine = new Map<string, LaunchContribution[]>();
    if (viewerId) {
      const contributions = await this.prisma.launchContribution.findMany({
        where: {
          launchRowId: { in: launches.map((launch) => launch.id) },
          contributor: { in: await this.evmWalletsOf(viewerId) },
        },
      });
      for (const contribution of contributions) {
        const list = mine.get(contribution.launchRowId) ?? [];
        list.push(contribution);
        mine.set(contribution.launchRowId, list);
      }
    }

    return launches.map((launch) =>
      toLaunchView(
        launch,
        this.chains.get(launch.chainKey)!,
        userByAddress.get(launch.creatorAddress) ?? null,
        mine.get(launch.id) ?? [],
        now,
      ),
    );
  }
}
