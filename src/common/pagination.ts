import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

/** Query string of every paginated list: `?limit=20&cursor=<nextCursor>`. */
export class PaginationQueryDto {
  /** `nextCursor` of the previous page. Omit it to get the first page. */
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit: number = DEFAULT_PAGE_SIZE;
}

export interface Page<T> {
  items: T[];
  /** Null when there are no more pages. */
  nextCursor: string | null;
}

/**
 * Turns `limit + 1` rows into a page: the extra row only tells whether there
 * is a next page.
 */
export function toPage<Row extends { id: string }, Item>(
  rows: Row[],
  limit: number,
  toItem: (row: Row) => Item,
): Page<Item> {
  const pageRows = rows.slice(0, limit);
  return {
    items: pageRows.map(toItem),
    nextCursor: rows.length > limit ? pageRows[pageRows.length - 1].id : null,
  };
}
