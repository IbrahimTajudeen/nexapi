"use client";
import { useMemo, useState } from "react";
import { LABS, composeLab, type LabId, type Selection } from "@/lib/labs";
import { Console } from "./Console";

/**
 * Every option of a feature, with its type and default. Pick a choice per option and the program
 * below rewrites itself; Run executes it against the real engine and a mock API in the page.
 */
export function OptionLab({ id }: { id: LabId }) {
  const lab = LABS[id];
  const [selection, setSelection] = useState<Selection>({});
  const code = useMemo(() => composeLab(lab, selection), [lab, selection]);
  const changed = Object.values(selection).some((v) => v !== 0);

  return (
    <section className="lab" aria-label={lab.title}>
      <header className="lab-head">
        <h4>{lab.title}</h4>
        <p>{lab.intro}</p>
      </header>
      <div className="lab-options">
        {lab.options.map((option) => {
          const index = selection[option.name] ?? 0;
          const choice = option.choices[index] ?? option.choices[0];
          const groupId = `${lab.id}-${option.name}`;
          return (
            <fieldset key={option.name} className="lab-option">
              <legend>
                <code>{option.name}</code>
                <span className="lab-type">{option.type}</span>
                <span className="lab-default">default: {option.default}</span>
              </legend>
              <p className="lab-summary">{option.summary}</p>
              <div className="lab-choices" role="radiogroup" aria-labelledby={groupId}>
                <span id={groupId} className="sr-only">
                  {option.name}
                </span>
                {option.choices.map((c, i) => (
                  <label key={c.label} className={i === index ? "on" : undefined}>
                    <input
                      type="radio"
                      name={groupId}
                      checked={i === index}
                      onChange={() => setSelection((s) => ({ ...s, [option.name]: i }))}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
              {choice && <p className="lab-note">{choice.note}</p>}
            </fieldset>
          );
        })}
      </div>
      <div className="lab-run">
        <div className="lab-run-bar">
          <span>Generated program</span>
          {changed && (
            <button type="button" className="btn small" onClick={() => setSelection({})}>
              Back to defaults
            </button>
          )}
        </div>
        <Console code={code} title={`${lab.id}-lab.js`} />
      </div>
    </section>
  );
}
