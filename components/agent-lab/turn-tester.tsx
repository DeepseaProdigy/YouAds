"use client";

import { FormEvent, useState } from "react";

import { BANK } from "@/lib/room/personas";
import type { TurnOutput } from "@/lib/schemas/turn";

type TurnResponse = {
  ok: boolean;
  result?: TurnOutput;
  error?: string;
};

export function TurnTester() {
  const [seatedIds, setSeatedIds] = useState<string[]>(["helen-ward"]);
  const [utterance, setUtterance] = useState(
    "Hello — how are you doing today?",
  );
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<TurnResponse | null>(null);

  const toggleSeat = (id: string) => {
    setSeatedIds((current) =>
      current.includes(id)
        ? current.filter((seatId) => seatId !== id)
        : [...current, id],
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!utterance.trim() || seatedIds.length === 0) return;

    setLoading(true);
    setResponse(null);

    try {
      const res = await fetch("/api/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          utterance: utterance.trim(),
          seatedIds,
        }),
      });

      const data = (await res.json()) as TurnResponse;
      setResponse(data);
    } catch (error) {
      setResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Request failed.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="agent-lab">
      <form className="agent-lab-form" onSubmit={submit}>
        <fieldset className="agent-lab-fieldset">
          <legend>Seat personas</legend>
          <ul className="agent-lab-list">
            {BANK.map((persona) => (
              <li key={persona.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={seatedIds.includes(persona.id)}
                    onChange={() => toggleSeat(persona.id)}
                  />
                  <span>
                    {persona.display_name}
                    <em>{persona.relationship_to_user}</em>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        <label className="agent-lab-label" htmlFor="agent-lab-utterance">
          Prompt
        </label>
        <textarea
          id="agent-lab-utterance"
          rows={4}
          value={utterance}
          disabled={loading}
          onChange={(event) => setUtterance(event.target.value)}
        />

        <button
          type="submit"
          disabled={loading || !utterance.trim() || seatedIds.length === 0}
        >
          {loading ? "Calling orchestrator…" : "Send turn"}
        </button>
      </form>

      {response && (
        <section className="agent-lab-output">
          {!response.ok ? (
            <p className="agent-lab-error">{response.error ?? "Turn failed."}</p>
          ) : response.result ? (
            <>
              <h2>Reply lines</h2>
              <ul>
                {response.result.lines.map((line, index) => {
                  const persona = BANK.find((p) => p.id === line.speaker_id);
                  return (
                    <li key={`${line.speaker_id}-${index}`}>
                      <strong>
                        {persona?.display_name ?? line.speaker_id}
                      </strong>
                      <span className="agent-lab-affect">{line.affect}</span>
                      <p>{line.reply_text}</p>
                    </li>
                  );
                })}
              </ul>

              {response.result.user_distress && (
                <p className="agent-lab-warning">user_distress: true</p>
              )}

              <h2>Raw TurnOutput</h2>
              <pre>{JSON.stringify(response.result, null, 2)}</pre>
            </>
          ) : (
            <p className="agent-lab-error">No result in response.</p>
          )}
        </section>
      )}
    </div>
  );
}
