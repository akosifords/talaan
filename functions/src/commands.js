import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { fingerprint } from './workspaceMigration.js';
import { executeTransactionCommand } from './domain/executeCommand.js';
export const executeCommand = (db, uid, input) => executeTransactionCommand(db, uid, input, {
  fingerprint, timestamp: date => Timestamp.fromDate(date), serverTimestamp: () => FieldValue.serverTimestamp(),
});
