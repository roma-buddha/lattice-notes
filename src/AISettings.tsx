import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Download, Link2, RefreshCw, Trash2 } from "lucide-react";
import { ai, connectionName, providerNames, type Connection, type Provider } from "./ai";

type Tab = "Your models" | "API" | "Local" | "Hugging Face";
const apiProviders: Provider[] = ["groq", "openrouter", "google", "nvidia", "custom"];
const bytes = (n: number) => n ? `${(n / 1024 ** 3).toFixed(n > 10 * 1024 ** 3 ? 0 : 1)} GB` : "Size unavailable";

export function AISettings() {
  const [tab, setTab] = useState<Tab>("Your models");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [provider, setProvider] = useState<Provider>("groq");
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [trusted, setTrusted] = useState(false);
  const [show, setShow] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [ollama, setOllama] = useState<{ name: string; size: number }[]>([]);
  const [localName, setLocalName] = useState("Local server");
  const [localUrl, setLocalUrl] = useState("http://127.0.0.1:1234/v1");
  const [localKey, setLocalKey] = useState("");
  const [localModels, setLocalModels] = useState<string[]>([]);
  const [localModel, setLocalModel] = useState("");
  const [query, setQuery] = useState("");
  const [hfModels, setHfModels] = useState<{ id: string; downloads: number; likes: number }[]>([]);
  const [repository, setRepository] = useState("");
  const [hfFiles, setHfFiles] = useState<{ path: string; size: number }[]>([]);
  const [hfFile, setHfFile] = useState("");
  const [installName, setInstallName] = useState("");
  const [progress, setProgress] = useState<{ stage: string; received: number; total?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const loadConnections = async () => setConnections(await ai.connections());
  useEffect(() => { void loadConnections().catch((e) => setError(String(e))); }, []);
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<{ stage: string; received: number; total?: number }>("lotus-hf-download", (event) => setProgress(event.payload)).then((dispose) => { unlisten = dispose; });
    return () => unlisten?.();
  }, []);
  useEffect(() => {
    if (tab !== "Local" && tab !== "Your models") return;
    void ai.ollamaModels().then(setOllama).catch(() => setOllama([]));
  }, [tab]);
  const run = async (task: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(""); setStatus("");
    try { await task(); } catch (e) { setError(String(e)); } finally { setBusy(false); }
  };
  const selected = connections.find((item) => item.provider === provider);
  const selectProvider = (next: Provider) => {
    setProvider(next);
    const saved = connections.find((item) => item.provider === next);
    setName(saved?.name ?? ""); setBaseUrl(saved?.base_url ?? ""); setKey(""); setShow(false); setTrusted(false); setModels([]); setModel(saved?.model ?? "");
  };
  const source = (connection: Connection) => connection.source === "ollama" ? "Ollama" : connection.source === "local" ? "Local server" : "API";
  return <div className="ai-settings">
    <h3>AI models</h3>
    <p className="muted">Choose where Lotus can run chat. API keys stay in Windows credential storage and are never exported.</p>
    <nav className="ai-model-tabs" aria-label="AI model settings">
      {(["Your models", "API", "Local", "Hugging Face"] as Tab[]).map((value) => <button key={value} aria-current={tab === value ? "page" : undefined} onClick={() => { setTab(value); setError(""); setStatus(""); }}>{value}</button>)}
    </nav>

    {tab === "Your models" && <section className="ai-model-overview">
      <div className="ai-section-heading"><h4>Connected models</h4><button className="icon" title="Refresh models" aria-label="Refresh models" onClick={() => void run(async () => { await loadConnections(); setOllama(await ai.ollamaModels().catch(() => [])); })}><RefreshCw size={15}/></button></div>
      {connections.map((connection) => <article className="ai-model-card" key={connection.provider}>
        <div><strong>{connection.model}</strong><small>{source(connection)} · {connectionName(connection)}</small><small>{connection.source === "ollama" ? "Installed in Ollama" : connection.base_url}</small></div>
        <div className="ai-card-actions"><span className="ai-connected">Connected</span><button title="Remove from Lotus" aria-label={`Remove ${connection.model} from Lotus`} onClick={() => void run(async () => { await ai.remove(connection.provider); await loadConnections(); window.dispatchEvent(new Event("lotus-ai-settings")); })}><Link2 size={14}/></button></div>
      </article>)}
      {!connections.length && <p className="muted">No models connected yet. Add an API provider or a local model.</p>}
      {!!ollama.length && <><h4 className="ai-installed-heading">Installed in Ollama</h4>{ollama.map((item) => <article className="ai-model-card installed" key={item.name}><div><strong>{item.name}</strong><small>Ollama · {bytes(item.size)}</small></div><button className="danger-icon" title="Delete from Ollama" aria-label={`Delete ${item.name} from Ollama`} onClick={() => { if (window.confirm(`Delete ${item.name} from Ollama? This removes its local model files.`)) void run(async () => { await ai.deleteOllama(item.name); await loadConnections(); setOllama(await ai.ollamaModels()); window.dispatchEvent(new Event("lotus-ai-settings")); }); }}><Trash2 size={14}/></button></article>)}</>}
    </section>}

    {tab === "API" && <fieldset disabled={busy} className="ai-form">
      <label>Provider<select value={provider} aria-label="Provider" onChange={(e) => selectProvider(e.target.value as Provider)}>{apiProviders.map((item) => <option key={item} value={item}>{item === "openrouter" ? "OpenRouter · free models" : providerNames[item]}</option>)}</select></label>
      {provider === "custom" && <><label>Provider name<input value={name} maxLength={80} placeholder="Your provider" onChange={(e) => setName(e.target.value)}/></label><label>API base URL<input type="url" spellCheck={false} value={baseUrl} placeholder="https://provider.example/v1" onChange={(e) => { setBaseUrl(e.target.value); setKey(""); setModels([]); setTrusted(false); }}/></label><label className="ai-consent"><input type="checkbox" checked={trusted} onChange={(e) => setTrusted(e.target.checked)}/>I trust this endpoint to receive my API key and requests.</label></>}
      <label>API key<div className="ai-key-field"><input autoComplete="off" spellCheck={false} type={show ? "text" : "password"} value={key} placeholder={selected ? "Key saved · leave blank to keep" : "Paste your provider API key"} onChange={(e) => { setKey(e.target.value); setModels([]); }}/><button type="button" onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</button></div></label>
      <button disabled={(!key.trim() && !selected) || (provider === "custom" && !trusted)} onClick={() => void run(async () => { const list = await ai.models(provider, key, baseUrl); setModels(list); setModel(list.includes(selected?.model ?? "") ? selected!.model : list[0]); setStatus("Models loaded. Choose one, then test and save."); })}>Load models</button>
      <label>Model ID<input value={model} list="lotus-api-models" placeholder={selected?.model ?? "Load models or paste a model ID"} spellCheck={false} onChange={(e) => setModel(e.target.value)}/><datalist id="lotus-api-models">{models.map((item) => <option key={item} value={item}/>)}</datalist></label>
      <div className="ai-actions"><button className="primary" disabled={!model.trim() || (!key.trim() && !selected) || (provider === "custom" && (!trusted || !name.trim()))} onClick={() => void run(async () => { await ai.save(provider, key, model, name, baseUrl); setKey(""); await loadConnections(); window.dispatchEvent(new Event("lotus-ai-settings")); setStatus("Connection tested and saved securely."); })}>Test &amp; save</button>{selected && <button onClick={() => void run(async () => { await ai.remove(provider); await loadConnections(); window.dispatchEvent(new Event("lotus-ai-settings")); })}>Remove connection</button>}</div>
    </fieldset>}

    {tab === "Local" && <section className="ai-local">
      <div className="ai-section-heading"><div><h4>Ollama</h4><p className="muted">Models already installed on this computer. No API key is used.</p></div><button className="icon" title="Refresh Ollama" aria-label="Refresh Ollama" onClick={() => void run(async () => setOllama(await ai.ollamaModels()))}><RefreshCw size={15}/></button></div>
      {ollama.map((item) => <article className="ai-model-card" key={item.name}><div><strong>{item.name}</strong><small>{bytes(item.size)}</small></div><button className="primary" disabled={busy} onClick={() => void run(async () => { await ai.saveOllama(item.name); await loadConnections(); window.dispatchEvent(new Event("lotus-ai-settings")); setStatus(`${item.name} connected to Lotus.`); })}>Connect</button></article>)}
      {!ollama.length && <p className="muted">Ollama is not currently available. Start it, then refresh.</p>}
      <hr/><h4>Compatible local server</h4><p className="muted">Connect LM Studio or another local OpenAI-compatible server. Lotus permits only localhost addresses.</p>
      <fieldset disabled={busy} className="ai-form"><label>Name<input value={localName} maxLength={80} onChange={(e) => setLocalName(e.target.value)}/></label><label>Local API base URL<input type="url" spellCheck={false} value={localUrl} onChange={(e) => { setLocalUrl(e.target.value); setLocalModels([]); }}/></label><label>Optional API key<input type="password" value={localKey} onChange={(e) => setLocalKey(e.target.value)}/></label><button onClick={() => void run(async () => { const list = await ai.models("local", localKey, localUrl); setLocalModels(list); setLocalModel(list[0] ?? ""); })}>Find models</button><label>Model<select value={localModel} onChange={(e) => setLocalModel(e.target.value)}><option value="">Choose a model…</option>{localModels.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><button className="primary" disabled={!localModel || !localName.trim()} onClick={() => void run(async () => { await ai.save("local", localKey, localModel, localName, localUrl); await loadConnections(); window.dispatchEvent(new Event("lotus-ai-settings")); setStatus("Local server model connected."); })}>Test &amp; connect</button></fieldset>
    </section>}

    {tab === "Hugging Face" && <section className="ai-huggingface">
      <h4>Download a GGUF model</h4><p className="muted">Public GGUF models only. Lotus downloads the chosen file, then imports it into Ollama. Downloads can be several GB.</p>
      <div className="ai-search-row"><input value={query} placeholder="Search public GGUF models…" onChange={(e) => setQuery(e.target.value)}/><button disabled={!query.trim() || busy} onClick={() => void run(async () => setHfModels(await ai.hfSearch(query)))}>Search</button></div>
      <div className="hf-models">{hfModels.map((item) => <button key={item.id} className={repository === item.id ? "selected" : ""} onClick={() => void run(async () => { setRepository(item.id); const files = await ai.hfFiles(item.id); setHfFiles(files); setHfFile(files[0]?.path ?? ""); setInstallName(item.id.split("/").at(-1)?.toLowerCase().replace(/[^a-z0-9._-]/g, "-") ?? "local-model"); })}><strong>{item.id}</strong><small>{item.downloads.toLocaleString()} downloads · {item.likes.toLocaleString()} likes</small></button>)}</div>
      {!!hfFiles.length && <fieldset disabled={busy && !progress} className="ai-form"><label>GGUF file<select value={hfFile} onChange={(e) => setHfFile(e.target.value)}>{hfFiles.map((item) => <option key={item.path} value={item.path}>{item.path} · {bytes(item.size)}</option>)}</select></label><label>Ollama model name<input value={installName} onChange={(e) => setInstallName(e.target.value)}/></label><p className="ai-disk-warning">This download needs {bytes(hfFiles.find((item) => item.path === hfFile)?.size ?? 0)} plus 512 MB of temporary free disk space.</p><div className="ai-actions">{progress && progress.stage !== "Installed" ? <button onClick={() => void ai.hfCancel()}>Cancel download</button> : <button className="primary" disabled={!hfFile || !installName.trim()} onClick={() => void run(async () => { setProgress({ stage: "Starting…", received: 0 }); try { await ai.hfDownloadImport(repository, hfFile, installName); } catch (e) { setProgress(null); throw e; } await loadConnections(); setOllama(await ai.ollamaModels()); window.dispatchEvent(new Event("lotus-ai-settings")); setStatus("Model installed in Ollama and connected to Lotus."); })}><Download size={15}/> Download &amp; import</button>}</div>{progress && <p role="status">{progress.stage}{progress.total ? ` · ${bytes(progress.received)} of ${bytes(progress.total)}` : ""}</p>}</fieldset>}
    </section>}
    {status && <p role="status">{status}</p>}{error && <p role="alert" className="ai-error">{error}</p>}
  </div>;
}
