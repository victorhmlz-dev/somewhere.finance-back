import { Module } from '@nestjs/common';
import { PostsModule } from '../posts/posts.module.js';
import { ReactionsModule } from '../reactions/reactions.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { CHAIN_READER_FACTORY, createRpcChainReader } from './chain-reader.js';
import { LaunchIndexerService } from './launch-indexer.service.js';
import { LaunchesController } from './launches.controller.js';
import { LaunchesService } from './launches.service.js';

@Module({
  imports: [UploadsModule, PostsModule, ReactionsModule],
  controllers: [LaunchesController],
  providers: [
    LaunchesService,
    LaunchIndexerService,
    { provide: CHAIN_READER_FACTORY, useValue: createRpcChainReader },
  ],
})
export class LaunchpadModule {}
