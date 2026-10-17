import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedUser } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { BalancesService } from './balances.service.js';

@Controller('balances')
export class BalancesController {
  constructor(private readonly balances: BalancesService) {}

  /**
   * What the wallets of the signed-in account hold on every chain, with its
   * value in dollars and whether each wallet can pay the fees of each chain.
   * Only for the account itself.
   */
  @Get()
  @UseGuards(AuthGuard)
  mine(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.balances.forUser(currentUser.id);
  }
}
