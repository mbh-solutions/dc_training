# Deliberately defective semantic-review canary

The candidate says the Home boundary owns both route switching and signed-in presentation:

```tsx
function Home() {
  const [screen, setScreen] = useState("home");
  return screen === "assignment" ? <Assignment /> : <HomePresentation onOpen={() => setScreen("assignment")} />;
}
```

The candidate says the Assignment boundary owns editor state, Supabase persistence, and rendering:

```tsx
function Assignment() {
  const [assignment, setAssignment] = useState<AssignmentRow | null>(null);
  const load = async () => setAssignment((await supabase.from("assignments").select()).data as AssignmentRow);
  const save = async () => { setSaving(true); await supabase.from("assignments").upsert(assignment); setScreen("setup"); };
  return <><button onClick={goBack}>Back</button><AssignmentForm onSave={save} /></>;
}
```

The Back control remains enabled while save is pending, so navigation or unmount can occur before the stale completion forces the screen to setup.

The requested additional behavior is implemented.
