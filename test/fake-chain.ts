import {
  encodeAbiParameters,
  encodeEventTopics,
  keccak256,
  toHex,
  type Abi,
  type AbiEvent,
  type Hex,
} from 'viem';
import type {
  ChainBlock,
  ChainLog,
  ChainReader,
} from '../src/launchpad/chain-reader.js';

/** An event to put in a block of the fake chain. */
export interface FakeEvent {
  /** Contract that emits it. */
  address: Hex;
  abi: Abi;
  name: string;
  args: Record<string, unknown>;
}

/**
 * A chain that lives in memory, for testing the indexer without a node. It
 * encodes events exactly as a real chain would, so the indexer decodes them
 * with the same code it uses in production.
 */
export class FakeChain implements ChainReader {
  private readonly blocks: ChainBlock[] = [];
  private readonly logs: ChainLog[] = [];
  private salt = 0;

  /** Number of the last block. */
  get height(): number {
    return this.blocks.length - 1;
  }

  /** Adds a block with those events. Returns its number. */
  mine(events: FakeEvent[] = [], time = new Date()): number {
    const blockNumber = this.blocks.length;
    this.blocks.push({
      hash: keccak256(toHex(`block-${blockNumber}-${this.salt}`)),
      timestamp: BigInt(Math.floor(time.getTime() / 1000)),
    });
    events.forEach((event, logIndex) => {
      const item = event.abi.find(
        (entry): entry is AbiEvent =>
          entry.type === 'event' && entry.name === event.name,
      );
      if (!item) throw new Error(`No event ${event.name} in that ABI`);
      const inData = item.inputs.filter((input) => !input.indexed);
      this.logs.push({
        address: event.address,
        topics: encodeEventTopics({
          abi: [item],
          eventName: event.name,
          args: event.args,
        } as never) as [Hex, ...Hex[]],
        data: encodeAbiParameters(
          inData,
          inData.map((input) => event.args[input.name!]),
        ),
        blockNumber: BigInt(blockNumber),
        transactionHash: keccak256(
          toHex(`tx-${blockNumber}-${logIndex}-${this.salt}`),
        ),
        logIndex,
      });
    });
    return blockNumber;
  }

  /** The hash the next block will give to the transaction of one event. */
  nextTxHash(logIndex = 0): Hex {
    return keccak256(
      toHex(`tx-${this.blocks.length}-${logIndex}-${this.salt}`),
    );
  }

  /** Replaces a block by another with the same number, as a reorg does. */
  replaceBlock(blockNumber: number): void {
    this.salt += 1;
    this.blocks[blockNumber] = {
      ...this.blocks[blockNumber],
      hash: keccak256(toHex(`block-${blockNumber}-${this.salt}`)),
    };
  }

  getBlockNumber(): Promise<bigint> {
    return Promise.resolve(BigInt(this.height));
  }

  getBlock(blockNumber: bigint): Promise<ChainBlock> {
    const block = this.blocks[Number(blockNumber)];
    return block
      ? Promise.resolve(block)
      : Promise.reject(new Error(`Block ${blockNumber} not found`));
  }

  getLogs(range: {
    addresses: Hex[];
    fromBlock: bigint;
    toBlock: bigint;
  }): Promise<ChainLog[]> {
    const addresses = range.addresses.map((address) => address.toLowerCase());
    return Promise.resolve(
      this.logs.filter(
        (log) =>
          log.blockNumber >= range.fromBlock &&
          log.blockNumber <= range.toBlock &&
          addresses.includes(log.address.toLowerCase()),
      ),
    );
  }
}
