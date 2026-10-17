import { Module } from '@nestjs/common';
import {
  BALANCE_READER_FACTORY,
  createRpcBalanceReader,
} from './balance-reader.js';
import { BalancesController } from './balances.controller.js';
import { BalancesService } from './balances.service.js';
import {
  coinGeckoPrices,
  PRICE_SOURCE,
  PricesService,
} from './prices.service.js';

@Module({
  controllers: [BalancesController],
  providers: [
    BalancesService,
    PricesService,
    { provide: PRICE_SOURCE, useValue: coinGeckoPrices },
    { provide: BALANCE_READER_FACTORY, useValue: createRpcBalanceReader },
  ],
  exports: [PricesService],
})
export class BalancesModule {}
