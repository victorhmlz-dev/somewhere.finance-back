import { Global, Module } from '@nestjs/common';
import { AssetsService } from './assets.service.js';

// Global: launches, notifications and the indexer all read assets.
@Global()
@Module({
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
