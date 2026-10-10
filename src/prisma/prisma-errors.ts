import { Prisma } from '../generated/prisma/client.js';

/** True when a write failed because it would duplicate a unique value. */
export const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';
