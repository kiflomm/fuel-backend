import { FuelInventoryService } from './fuel-inventory.service';
import type { AuditService } from '../audit/audit.service';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../database/schema';

describe('FuelInventoryService', () => {
  it('should be injectable', () => {
    const db = {} as NodePgDatabase<typeof schema>;
    const audit = { logAction: jest.fn() } as unknown as AuditService;
    const service = new FuelInventoryService(db, audit);
    expect(service).toBeDefined();
  });
});
