import { Module } from '@nestjs/common';
import { CHAIN_READER_FACTORY, createRpcChainReader } from './chain-reader.js';
import { LaunchIndexerService } from './launch-indexer.service.js';
import { LaunchesController } from './launches.controller.js';
import { LaunchesService } from './launches.service.js';

@Module({
  controllers: [LaunchesController],
  providers: [
    LaunchesService,
    LaunchIndexerService,
    { provide: CHAIN_READER_FACTORY, useValue: createRpcChainReader },
  ],
})
export class LaunchpadModule {}
