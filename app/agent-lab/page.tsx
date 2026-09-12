import { TurnTester } from "@/components/agent-lab/turn-tester";

export default function AgentLabPage() {
  return (
    <main className="agent-lab-page">
      <header>
        <p className="eyebrow">Agent lab</p>
        <h1>Turn bridge tester</h1>
        <p>
          Seat sample personalities from{" "}
          <code>data/personalities.json</code>, send a prompt, and inspect the
          orchestrator&apos;s structured reply from <code>POST /api/turn</code>.
        </p>
      </header>
      <TurnTester />
    </main>
  );
}
