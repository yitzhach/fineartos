import { buildSnapshot, runOp, type StudioHandlers, type StudioRecords } from '../snapshot';
import { AssistantWindow } from './AssistantWindow';

/**
 * The Assistant window, wired to the studio's records and handlers. Loaded
 * with the tools, never in the first load.
 */
export function AssistantTool({
  records,
  handlers,
  openPlace,
}: {
  records: () => StudioRecords;
  handlers: StudioHandlers;
  openPlace: (place: string, control?: string) => void;
}) {
  return <AssistantWindow snapshot={() => buildSnapshot(records())} run={(op) => runOp(op, records(), handlers)} openPlace={openPlace} />;
}
