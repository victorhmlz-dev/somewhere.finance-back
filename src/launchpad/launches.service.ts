import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ReactionKind } from '../generated/prisma/enums.js';
import { ReactionsService } from '../reactions/reactions.service.js';
import { ConfigService } from '@nestjs/config';
import { type Page, pageArgs } from '../common/pagination.js';
import type { Env } from '../config/env.js';
import type { EvmChainConfig } from '../config/evm-chains.js';
import type {
  Launch,
  LaunchContribution,
  LaunchProfile,
  Prisma,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UploadsService } from '../uploads/uploads.service.js';
import { toUserSummary, type UserSummary } from '../users/user-profile.js';
import {
  ListLaunchesQueryDto,
  type LaunchStatusFilter,
} from './dto/list-launches-query.dto.js';
import {
  LaunchDetailsDto,
  PendingLaunchDetailsDto,
} from './dto/launch-details.dto.js';
import {
  applyLaunchDetails,
  applyPendingDetails,
  type DetailsRefusal,
  evmWalletsOf,
  type LaunchDetails,
} from './launch-details.js';
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

/** The answer for each reason the details of a launch were not set. */
const REFUSALS: Record<DetailsRefusal, () => Error> = {
  'not-creator': () =>
    new ForbiddenException('Only the creator can describe a launch'),
  'already-set': () =>
    new ConflictException(
      'The description and image of a launch are set once and never change',
    ),
  started: () =>
    new ConflictException(
      'The description and image can only be set before the sale starts',
    ),
};

@Injectable()
export class LaunchesService {
  private readonly chains: Map<string, EvmChainConfig>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly reactions: ReactionsService,
    config: ConfigService<Env, true>,
  ) {
    const chains = config.get('EVM_CHAINS', { infer: true });
    this.chains = new Map(chains.map((chain) => [chain.key, chain]));
  }

  /**
   * The launches shown: those of the Launchpad configured for each chain.
   * A chain taken out of the configuration, or a contract replaced by a new
   * one, stops being shown; nothing of it is deleted.
   */
  private configured(chainKey?: string): Prisma.LaunchWhereInput {
    const chains = [...this.chains.values()].filter(
      (chain) => chainKey === undefined || chain.key === chainKey,
    );
    return {
      OR: chains.map((chain) => ({
        chainKey: chain.key,
        launchpad: chain.launchpad,
      })),
    };
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
        AND: [
          this.configured(query.chain),
          { creatorAddress: query.creator },
          query.status ? statusCondition(query.status, now) : {},
          query.q
            ? {
                OR: [
                  { name: { contains: query.q, mode: 'insensitive' } },
                  { symbol: { contains: query.q, mode: 'insensitive' } },
                ],
              }
            : {},
        ],
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
      where: { AND: [this.configured(), { finalizedAt: { not: null } }] },
      orderBy: [{ finalizedAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        chainKey: true,
        tokenAddress: true,
        name: true,
        symbol: true,
      },
    });
    const profiles = await this.profilesOf(launches.map((launch) => launch.id));
    return toTokenList(
      launches.map((launch) => ({
        ...launch,
        imageUrl: profiles.get(launch.id)?.imageUrl ?? null,
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

  /**
   * Sets the description and image of a launch that is already indexed:
   * once, by its creator, before the sale starts.
   */
  async setDetails(
    id: string,
    userId: string,
    dto: LaunchDetailsDto,
  ): Promise<LaunchView> {
    const launch = await this.findConfigured(id);
    const details = await this.checkDetails(dto);
    const refusal = await this.prisma.$transaction((tx) =>
      applyLaunchDetails(tx, launch, userId, details, new Date()),
    );
    if (refusal) throw REFUSALS[refusal]();
    return this.get(id, userId);
  }

  /**
   * Takes the description and image of a launch right after the transaction
   * that creates it. If the launch is not indexed yet, they wait for it and
   * the answer is null; the indexer applies them, if the transaction turns
   * out to be the user's, as soon as it reads the launch.
   */
  async sendDetails(
    userId: string,
    dto: PendingLaunchDetailsDto,
  ): Promise<LaunchView | null> {
    if (!this.chains.has(dto.chain)) {
      throw new BadRequestException('chain is not a configured chain');
    }
    const details = await this.checkDetails(dto);
    const indexed = () =>
      this.prisma.launch.findFirst({
        where: {
          AND: [this.configured(dto.chain), { createdTxHash: dto.txHash }],
        },
      });

    const launch = await indexed();
    if (launch) return this.setDetails(launch.id, userId, dto);

    const key = { chainKey: dto.chain, txHash: dto.txHash, userId };
    await this.prisma.pendingLaunchDetails.upsert({
      where: { chainKey_txHash_userId: key },
      create: { ...key, ...details },
      update: details,
    });

    // The indexer may have read the launch in the meantime
    const late = await indexed();
    if (!late) return null;
    await this.prisma.$transaction((tx) =>
      applyPendingDetails(tx, late, new Date()),
    );
    return this.get(late.id, userId);
  }

  /** Adds or removes an emoji reaction, and returns the launch as it is now. */
  async setReaction(
    id: string,
    userId: string,
    kind: ReactionKind,
    on: boolean,
  ): Promise<LaunchView> {
    const launch = await this.findConfigured(id);
    const owner = await this.prisma.wallet.findFirst({
      where: { family: 'evm', address: launch.creatorAddress },
      select: { userId: true },
    });
    await this.reactions.set(
      userId,
      { launchId: id },
      kind,
      on,
      owner?.userId ?? null,
    );
    return this.get(id, userId);
  }

  /** Answers 404 unless the launch exists on a configured chain. */
  async assertExists(id: string): Promise<void> {
    await this.findConfigured(id);
  }

  /** The description, and the image only if it was uploaded here. */
  private async checkDetails(dto: LaunchDetailsDto): Promise<LaunchDetails> {
    if (dto.image) await this.uploads.assertOwnImage(dto.image, 'image');
    return { description: dto.description, imageUrl: dto.image ?? null };
  }

  private async findConfigured(id: string): Promise<Launch> {
    const launch = await this.prisma.launch.findUnique({ where: { id } });
    const chain = launch ? this.chains.get(launch.chainKey) : undefined;
    if (!launch || chain?.launchpad !== launch.launchpad) {
      throw new NotFoundException('Launch not found');
    }
    return launch;
  }

  /** The descriptions and images of those launches, by launch id. */
  private async profilesOf(ids: string[]): Promise<Map<string, LaunchProfile>> {
    if (ids.length === 0) return new Map();
    const profiles = await this.prisma.launchProfile.findMany({
      where: { launchId: { in: ids } },
    });
    return new Map(profiles.map((profile) => [profile.launchId, profile]));
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
          contributor: { in: await evmWalletsOf(this.prisma, viewerId) },
        },
      });
      for (const contribution of contributions) {
        const list = mine.get(contribution.launchRowId) ?? [];
        list.push(contribution);
        mine.set(contribution.launchRowId, list);
      }
    }

    const ids = launches.map((launch) => launch.id);
    const [reactions, profiles] = await Promise.all([
      this.reactions.countsFor('launchId', ids, viewerId),
      this.profilesOf(ids),
    ]);

    return launches.map((launch) =>
      toLaunchView(
        launch,
        this.chains.get(launch.chainKey)!,
        userByAddress.get(launch.creatorAddress) ?? null,
        mine.get(launch.id) ?? [],
        profiles.get(launch.id) ?? null,
        reactions.get(launch.id)!,
        now,
      ),
    );
  }
}
