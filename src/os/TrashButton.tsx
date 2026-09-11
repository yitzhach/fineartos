interface Props {
  onTrash: () => void;
  /** Extra warning, for a folder that would take its contents with it. */
  note?: string;
}

/**
 * The Move to Trash button inside an open record.
 *
 * It is not a confirm-first button, deliberately: this action is reversible,
 * and asking "are you sure?" for something undoable teaches people to click
 * through the questions that matter — the one guarding Empty Trash. The
 * tooltip says where the record goes, and the message after it says how to
 * get it back.
 */
export function TrashButton({ onTrash, note }: Props) {
  return (
    <button
      className="btn"
      data-variant="danger"
      onClick={onTrash}
      title={note ?? 'Moves this to the Trash. Nothing is deleted until you empty the Trash.'}
    >
      Move to Trash
    </button>
  );
}
