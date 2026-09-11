import { GhostGrid, GhostRows, MockTool } from './MockTool';

/**
 * The tools that are not built yet, drawn so the shape of the finished suite
 * is visible. Every one is labelled a preview by `MockTool`.
 *
 * These deliberately show *structure* rather than invented content: a calendar
 * with real dates but no events, a client list with placeholder rows. Filling
 * them with plausible names and figures would make screenshots look better and
 * make the app a liar.
 */

export interface ToolDefinition {
  id: string;
  name: string;
  icon: string;
  /** Built tools render their own content; these render a preview. */
  built: boolean;
  render?: () => JSX.Element;
}

function Calendar() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: first }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];

  return (
    <MockTool
      name="Calendar"
      purpose="It will hold show dates, delivery dates and studio time in one view."
      needs="The dates below are real; there are no events because nothing records them yet."
    >
      <div className="mock-cal">
        <h3>{today.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
        <div className="cal-grid">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <span key={i} className="cal-head">{d}</span>
          ))}
          {cells.map((day, i) => (
            <span
              key={i}
              className="cal-day"
              data-today={day === today.getDate() ? 'true' : 'false'}
            >
              {day ?? ''}
            </span>
          ))}
        </div>
      </div>
    </MockTool>
  );
}

function Clients() {
  return (
    <MockTool
      name="Clients"
      purpose="One record per collector: their commissions, their invoices, what they have bought."
      needs="Today a client is a name typed on each commission, not a record of its own."
    >
      <GhostRows count={6} />
    </MockTool>
  );
}

function Files() {
  return (
    <MockTool
      name="Files"
      purpose="Every image and document across all projects, in one browsable place."
      needs="Images already live on this device; this view over them is what is missing."
    >
      <GhostGrid count={10} />
    </MockTool>
  );
}

function Templates() {
  return (
    <MockTool
      name="Templates"
      purpose="Reusable terms, line items and email wording, so a new commission starts filled in."
    >
      <GhostRows labels={['Standard commission terms', 'Deposit wording', 'Delivery note', 'Chase email']} />
    </MockTool>
  );
}

function Shows() {
  return (
    <MockTool
      name="Shows"
      purpose="Fairs and exhibitions: deadlines, booth costs, what sold and what it cost to be there."
      needs="It stays empty rather than showing a schedule nobody entered."
    >
      <GhostRows count={4} />
    </MockTool>
  );
}

function Artwork() {
  return (
    <MockTool
      name="Artwork"
      purpose="The catalogue: every piece, its dimensions, where it is and whether it sold."
    >
      <GhostGrid count={12} />
    </MockTool>
  );
}

function Finance() {
  return (
    <MockTool
      name="Finance"
      purpose="Income, expenses and what is owed, drawn from the invoices you have already made."
      needs="Nothing here is calculated yet — the invoices are the real numbers today."
    >
      <div className="mock-figures">
        {['Income', 'Outstanding', 'Expenses'].map((label) => (
          <div key={label}>
            <span className="k">{label}</span>
            <span className="ghost-bar" style={{ width: '70%' }} aria-hidden="true" />
          </div>
        ))}
      </div>
      <GhostRows count={5} />
    </MockTool>
  );
}

function Connect() {
  return (
    <MockTool
      name="Connect"
      purpose="Galleries, buyers and mailing list in one place, with a record of who you spoke to."
    >
      <GhostRows count={5} />
    </MockTool>
  );
}

function Visualizer() {
  return (
    <MockTool
      name="Visualizer"
      purpose="Put a piece on a client's wall to scale, so they can see it before they commit."
      needs="It needs a room photo, the piece's real dimensions, and a scale reference."
    >
      <div className="mock-viz" aria-hidden="true">
        <div className="viz-room">
          <div className="viz-art" />
        </div>
      </div>
    </MockTool>
  );
}

/** Mock tools by id, matching the dock. */
export const MOCK_TOOLS: Record<string, () => JSX.Element> = {
  calendar: Calendar,
  clients: Clients,
  files: Files,
  templates: Templates,
  shows: Shows,
  artwork: Artwork,
  finance: Finance,
  connect: Connect,
  visualizer: Visualizer,
};

export const MOCK_TOOL_NAMES: Record<string, string> = {
  calendar: 'Calendar',
  clients: 'Clients',
  files: 'Files',
  templates: 'Templates',
  shows: 'Shows',
  artwork: 'Artwork',
  finance: 'Finance',
  connect: 'Connect',
  visualizer: 'Visualizer',
};
