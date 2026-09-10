import { useState } from "react";
import yaml from "js-yaml";
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Plus,
  Tag,
  Text,
  Hash,
  ToggleLeft,
  X,
} from "lucide-react";
import { splitFrontmatter, updateFrontmatter } from "./core/markdown";

export function PropertiesPanel({
  content,
  locked,
  onChange,
}: {
  content: string;
  locked: boolean;
  onChange: (content: string) => void;
}) {
  const parsed = splitFrontmatter(content);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("text");
  const update = (key: string, value: unknown) =>
    onChange(
      updateFrontmatter(content, { ...parsed.properties, [key]: value }),
    );
  return (
    <section className="properties-panel" aria-label="Markdown properties">
      <header>
        <button
          className="properties-toggle"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <strong>Properties</strong>
        </button>
      </header>
      {open && !parsed.valid && (
        <p role="alert">
          Properties could not be read. The original metadata is preserved;
          repair its YAML in a text editor before editing properties.
        </p>
      )}
      {open && parsed.valid && (
        <div className="property-list">
          {locked && !Object.keys(parsed.properties).length && (
            <p className="muted">No properties in this note.</p>
          )}
          {Object.entries(parsed.properties).map(([key, value]) => {
            const date =
              typeof value === "string" &&
              /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value);
            const list = Array.isArray(value);
            const complex =
              value !== null && typeof value === "object" && !list;
            const TypeIcon = date
              ? Calendar
              : list
                ? Tag
                : typeof value === "number"
                  ? Hash
                  : typeof value === "boolean"
                    ? ToggleLeft
                    : Text;
            return (
              <div className="property-row" key={key}>
                <TypeIcon size={16} />
                <input
                  aria-label="Property name"
                  readOnly={locked}
                  defaultValue={key}
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (next === key) return;
                    if (!next || next in parsed.properties) {
                      e.target.value = key;
                      setError("Choose a unique property name.");
                      return;
                    }
                    const entries = Object.entries(parsed.properties).map(
                      ([name, item]) => [name === key ? next : name, item],
                    );
                    onChange(
                      updateFrontmatter(content, Object.fromEntries(entries)),
                    );
                  }}
                />
                {list ? (
                  <div className="property-tags">
                    {value.map((tag, i) => (
                      <span className="property-chip" key={i}>
                        {String(tag)}
                        {!locked && (
                          <button
                            aria-label={`Remove ${String(tag)}`}
                            onClick={() =>
                              update(
                                key,
                                value.filter((_, j) => i !== j),
                              )
                            }
                          >
                            <X size={12} />
                          </button>
                        )}
                      </span>
                    ))}
                    {!locked && (
                      <input
                        aria-label={`Add value to ${key}`}
                        placeholder="Add…"
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            e.currentTarget.value.trim()
                          ) {
                            e.preventDefault();
                            update(key, [
                              ...value,
                              e.currentTarget.value.trim(),
                            ]);
                            e.currentTarget.value = "";
                          }
                        }}
                      />
                    )}
                  </div>
                ) : typeof value === "boolean" ? (
                  <input
                    type="checkbox"
                    aria-label={`Value for ${key}`}
                    disabled={locked}
                    checked={value}
                    onChange={(e) => update(key, e.target.checked)}
                  />
                ) : !date && typeof value !== "number" ? (
                  <textarea
                    key={`${key}:${locked}`}
                    aria-label={`Value for ${key}`}
                    readOnly={locked}
                    rows={Math.min(
                      4,
                      Math.max(1, Math.ceil(String(value ?? "").length / 45)),
                    )}
                    defaultValue={
                      complex
                        ? yaml.dump(value, { flowLevel: 0 }).trim()
                        : String(value ?? "")
                    }
                    onBlur={(e) => {
                      if (e.target.value === e.target.defaultValue) return;
                      try {
                        update(
                          key,
                          complex
                            ? yaml.load(e.target.value, {
                                schema: yaml.JSON_SCHEMA,
                              })
                            : e.target.value,
                        );
                        setError("");
                      } catch {
                        setError(
                          `Invalid value for ${key}; previous value preserved.`,
                        );
                      }
                    }}
                  />
                ) : (
                  <input
                    key={`${key}:${locked}`}
                    aria-label={`Value for ${key}`}
                    readOnly={locked}
                    type={
                      date && !locked
                        ? "date"
                        : typeof value === "number"
                          ? "number"
                          : "text"
                    }
                    defaultValue={
                      date
                        ? locked
                          ? new Date(String(value).slice(0, 10) + "T12:00:00")
                              .toLocaleDateString("en-GB", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })
                              .replaceAll(" ", "-")
                          : String(value).slice(0, 10)
                        : complex
                          ? yaml.dump(value, { flowLevel: 0 }).trim()
                          : value == null
                            ? ""
                            : String(value)
                    }
                    onBlur={(e) => {
                      try {
                        if (e.target.value === e.target.defaultValue) return;
                        const text = e.target.value;
                        update(
                          key,
                          complex
                            ? yaml.load(text, { schema: yaml.JSON_SCHEMA })
                            : typeof value === "number"
                              ? text === ""
                                ? value
                                : Number(text)
                              : text,
                        );
                        setError("");
                      } catch {
                        setError(
                          `Invalid value for ${key}; previous value preserved.`,
                        );
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                  />
                )}
                {!locked && (
                  <button
                    className="property-remove"
                    aria-label={`Delete property ${key}`}
                    title="Remove property"
                    onClick={() => {
                      const next = { ...parsed.properties };
                      delete next[key];
                      onChange(updateFrontmatter(content, next));
                    }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })}
          {!locked && (
            <button
              className="add-property"
              onClick={() => {
                setAdding(!adding);
                setNewName("");
              }}
            >
              <Plus size={15} />
              Add property
            </button>
          )}
          {adding && !locked && (
            <form
              className="add-property-form"
              onSubmit={(e) => {
                e.preventDefault();
                const key = newName.trim();
                if (!key || key in parsed.properties) {
                  setError("Choose a unique property name.");
                  return;
                }
                update(
                  key,
                  newType === "list"
                    ? []
                    : newType === "number"
                      ? 0
                      : newType === "boolean"
                        ? false
                        : newType === "date"
                          ? new Date().toLocaleDateString("en-CA")
                          : "",
                );
                setAdding(false);
                setError("");
              }}
            >
              <input
                autoFocus
                required
                aria-label="New property name"
                placeholder="Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <select
                aria-label="Property type"
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
              >
                <option value="text">Text</option>
                <option value="list">Tags / list</option>
                <option value="date">Date</option>
                <option value="number">Number</option>
                <option value="boolean">Checkbox</option>
              </select>
              <button>Add</button>
            </form>
          )}
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </section>
  );
}
