import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ReactionKind } from '../generated/prisma/enums.js';
import { REACTION_KINDS } from './reactions.service.js';

/** Checks the `:kind` of a reaction route against the reactions there are. */
export class ParseReactionKindPipe implements PipeTransform<
  string,
  ReactionKind
> {
  transform(value: string): ReactionKind {
    if (!(REACTION_KINDS as readonly string[]).includes(value)) {
      throw new BadRequestException(
        `kind must be one of: ${REACTION_KINDS.join(', ')}`,
      );
    }
    return value as ReactionKind;
  }
}
