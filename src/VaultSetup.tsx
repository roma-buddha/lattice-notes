import { useEffect, useState } from "react";
import { AreaIconPicker } from "./AreaIcons";
import { api, type OrganizerState } from "./notus";

export function VaultSetup({
  kind,
  complete,
  cancel,
  onBusy,
}: {
  kind: "create" | "add";
  complete: (path: string, state: OrganizerState) => Promise<void>;
  cancel: () => void;
  onBusy: (value: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [newName, setNewName] = useState("");
  const [icon, setIcon] = useState("briefcase");
  const [state, setState] = useState<OrganizerState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState("");
  useEffect(() => {
    void api
      .organizer()
      .then(setState)
      .catch((e) => setError(String(e)));
  }, []);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        onBusy(true);
        setError("");
        void (async () => {
          let latest = await api.organizer();
          let category = area;
          if (area === "new") {
            const existing = latest.areas.find(
              (a) => a.name.toLowerCase() === newName.trim().toLowerCase(),
            );
            category = existing?.id ?? crypto.randomUUID();
            if (!existing)
              latest = await api.saveOrganizer({
                ...latest,
                areas: [
                  ...latest.areas,
                  { id: category, name: newName.trim(), icon },
                ],
              });
          }
          const path =
            created ||
            (kind === "create"
              ? await api.create("", "vault", name)
              : await api.importVault());
          if (!path) return;
          setCreated(path);
          latest = await api.organizer();
          if (category)
            latest = await api.saveOrganizer({
              ...latest,
              assignments: { ...latest.assignments, [path]: category },
            });
          await complete(path, latest);
        })()
          .catch((e) => setError(String(e)))
          .finally(() => {
            setBusy(false);
            onBusy(false);
          });
      }}
    >
      <fieldset disabled={busy || !!created} className="vault-setup-fields">
        {kind === "create" && (
          <label>
            Vault name
            <input
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}
        <label>
          Area
          <select
            aria-label="Vault area"
            value={area}
            onChange={(e) => setArea(e.target.value)}
          >
            <option value="">Uncategorized</option>
            {state?.areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
            <option value="new">Create a new area…</option>
          </select>
        </label>
        {area === "new" && (
          <>
            <label>
              Area name
              <input
                required
                maxLength={100}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </label>
            <AreaIconPicker value={icon} onChange={setIcon} />
          </>
        )}
      </fieldset>
      {kind === "add" && (
        <p className="dialog-hint">
          Choose an area, then choose the folder to copy. Original files remain
          unchanged.
        </p>
      )}
      {error && (
        <p role="alert" className="dialog-error">
          {created ? "Vault created; retry to finish assigning its area. " : ""}
          {error}
        </p>
      )}
      <footer className="dialog-footer">
        <button type="button" disabled={busy} onClick={cancel}>
          Cancel
        </button>
        <button disabled={busy || !state}>
          {busy
            ? "Working…"
            : created
              ? "Retry"
              : kind === "create"
                ? "Create vault"
                : "Choose existing vault…"}
        </button>
      </footer>
    </form>
  );
}
