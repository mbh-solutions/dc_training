import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { CHEST_EXERCISES, formatTargetRange } from "./rotation-assignment.js";

type Protocol = "rest_pause" | "straight_set";
type RangeChoice = "11-15" | "15-20" | "custom";
type Screen = "setup" | "exercise" | "protocol" | "range" | "review";

type Assignment = {
  body_part: "chest";
  exercise: string;
  protocol: Protocol;
  slot: "A1";
  target_max: number | null;
  target_min: number | null;
};

type RotationSetupProps = {
  onBack: () => void;
  userId: string;
};

function RotationSetup({ onBack, userId }: RotationSetupProps) {
  const [screen, setScreen] = useState<Screen>("setup");
  const [exercise, setExercise] = useState("");
  const [protocol, setProtocol] = useState<Protocol | "">("");
  const [rangeChoice, setRangeChoice] = useState<RangeChoice | "">("");
  const [customMin, setCustomMin] = useState("");
  const [customMax, setCustomMax] = useState("");
  const [saved, setSaved] = useState<Assignment | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase
      ?.from("rotation_assignments")
      .select("slot,body_part,exercise,protocol,target_min,target_max")
      .eq("user_id", userId)
      .eq("slot", "A1")
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setMessage("ASSIGNMENT COULD NOT BE LOADED");
        else if (data) setSaved(data as Assignment);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const target =
    rangeChoice === "11-15"
      ? [11, 15]
      : rangeChoice === "15-20"
        ? [15, 20]
        : [Number(customMin), Number(customMax)];
  const customRangeValid =
    Number.isInteger(target[0]) && target[0] > 0 && target[1] >= target[0];
  const rangeValid =
    rangeChoice === "11-15" ||
    rangeChoice === "15-20" ||
    (rangeChoice === "custom" && customRangeValid);

  const selectProtocol = (next: Protocol) => {
    if (next !== protocol) {
      setRangeChoice("");
      setCustomMin("");
      setCustomMax("");
    }
    setProtocol(next);
  };

  const save = async () => {
    if (!exercise || !protocol || (protocol === "rest_pause" && !rangeValid))
      return;
    setSaving(true);
    setMessage("");
    const assignment: Assignment = {
      body_part: "chest",
      exercise,
      protocol,
      slot: "A1",
      target_max: protocol === "rest_pause" ? target[1] : null,
      target_min: protocol === "rest_pause" ? target[0] : null,
    };
    const { error } = await supabase!.from("rotation_assignments").upsert(
      { ...assignment, user_id: userId, updated_at: new Date().toISOString() },
      { onConflict: "user_id,slot" },
    );
    setSaving(false);
    if (error) {
      setMessage("ASSIGNMENT COULD NOT BE SAVED");
      return;
    }
    setSaved(assignment);
    setScreen("setup");
  };

  if (screen === "setup") {
    return (
      <Shell title="ROTATION SETUP" onBack={onBack}>
        <p className="section-label rotation-label">A1 WORKOUT</p>
        <button className="assignment-card" type="button" onClick={() => setScreen("exercise")}>
          <span>CHEST</span>
          <strong>{saved?.exercise ?? "CHOOSE EXERCISE"}</strong>
          <b aria-hidden="true">›</b>
        </button>
        {saved && (
          <dl className="assignment-summary">
            <div><dt>PROTOCOL</dt><dd>{protocolLabel(saved.protocol)}</dd></div>
            <div><dt>TARGET RANGE</dt><dd>{formatTargetRange(saved.target_min, saved.target_max)}</dd></div>
          </dl>
        )}
        {message && <p className="form-message">{message}</p>}
      </Shell>
    );
  }

  if (screen === "exercise") {
    return (
      <Shell title="SELECT EXERCISE" subtitle="A1 · CHEST" onBack={() => setScreen("setup")}>
        <ChoiceList
          name="exercise"
          options={CHEST_EXERCISES.map((label) => ({ label, value: label }))}
          selected={exercise}
          onSelect={setExercise}
        />
        <FooterButton disabled={!exercise} onClick={() => setScreen("protocol")}>CONTINUE</FooterButton>
      </Shell>
    );
  }

  if (screen === "protocol") {
    return (
      <Shell title="SET PROTOCOL" subtitle="A1 · CHEST" onBack={() => setScreen("exercise")}>
        <h2 className="exercise-heading">{exercise}</h2>
        <p className="section-label rotation-label">PROTOCOL</p>
        <ChoiceList
          name="protocol"
          options={[
            { badge: "DC", label: "REST-PAUSE", value: "rest_pause" },
            { label: "STRAIGHT SET", value: "straight_set" },
          ]}
          selected={protocol}
          onSelect={(value) => selectProtocol(value as Protocol)}
        />
        <FooterButton
          disabled={!protocol}
          onClick={() => setScreen(protocol === "rest_pause" ? "range" : "review")}
        >CONTINUE</FooterButton>
      </Shell>
    );
  }

  if (screen === "range") {
    return (
      <Shell title="SET TARGET RANGE" subtitle="A1 · CHEST" onBack={() => setScreen("protocol")}>
        <h2 className="exercise-heading">{exercise}</h2>
        <p className="section-label rotation-label">TARGET TOTAL REPS</p>
        <ChoiceList
          name="range"
          options={[
            { badge: "DC", label: "11–15", value: "11-15" },
            { label: "15–20", value: "15-20" },
            { label: "CUSTOM", value: "custom" },
          ]}
          selected={rangeChoice}
          onSelect={(value) => setRangeChoice(value as RangeChoice)}
        />
        {rangeChoice === "custom" && (
          <div className="custom-range">
            <label>MINIMUM<input id="custom-min" type="number" min="1" inputMode="numeric" value={customMin} onChange={(event) => setCustomMin(event.target.value)} /></label>
            <label>MAXIMUM<input id="custom-max" type="number" min="1" inputMode="numeric" value={customMax} onChange={(event) => setCustomMax(event.target.value)} /></label>
          </div>
        )}
        <FooterButton disabled={!rangeValid} onClick={() => setScreen("review")}>CONTINUE</FooterButton>
      </Shell>
    );
  }

  return (
    <Shell title="REVIEW ASSIGNMENT" subtitle="A1 · CHEST" onBack={() => setScreen(protocol === "rest_pause" ? "range" : "protocol")}>
      <h2 className="review-exercise">{exercise}</h2>
      <dl className="review-list">
        <div><dt>SLOT</dt><dd>A1 · CHEST</dd></div>
        <div><dt>PROTOCOL</dt><dd>{protocolLabel(protocol as Protocol)}</dd></div>
        <div><dt>TARGET TOTAL REPS</dt><dd>{protocol === "rest_pause" ? formatTargetRange(target[0], target[1]) : "NOT APPLICABLE"}</dd></div>
      </dl>
      {message && <p className="form-message">{message}</p>}
      <FooterButton disabled={saving} onClick={() => void save()}>{saving ? "SAVING" : "SAVE"}</FooterButton>
    </Shell>
  );
}

function protocolLabel(protocol: Protocol) {
  return protocol === "rest_pause" ? "REST-PAUSE" : "STRAIGHT SET";
}

type Choice = { badge?: string; label: string; value: string };

function ChoiceList({ name, onSelect, options, selected }: { name: string; onSelect: (value: string) => void; options: readonly Choice[]; selected: string }) {
  return <div className="choice-list">{options.map((option) => (
    <label className={`choice-card${selected === option.value ? " choice-card--selected" : ""}`} key={option.value}>
      <input type="radio" name={name} value={option.value} checked={selected === option.value} onChange={() => onSelect(option.value)} />
      <strong>{option.label}</strong>
      {option.badge && <span className="dc-badge">{option.badge}</span>}
      <span className="choice-dot" aria-hidden="true" />
    </label>
  ))}</div>;
}

function FooterButton({ children, disabled, onClick }: { children: React.ReactNode; disabled: boolean; onClick: () => void }) {
  return <button className="primary-action flow-action" type="button" disabled={disabled} onClick={onClick}>{children}</button>;
}

function Shell({ children, onBack, subtitle, title }: { children: React.ReactNode; onBack: () => void; subtitle?: string; title: string }) {
  return <div className="app-shell rotation-shell">
    <header className="flow-header">
      <button className="back-action" type="button" onClick={onBack} aria-label="Back">‹</button>
      <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
    </header>
    <main>{children}</main>
  </div>;
}

export default RotationSetup;
