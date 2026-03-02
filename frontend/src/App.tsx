import { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload, Download, Copy, Check, X, Clock,
  AlertCircle, RotateCcw, Shield, Link,
  ArrowUpRight, Zap, CheckCircle,
} from "lucide-react";
import "./App.css";
import { uploadFile, validateCode, downloadFile } from "./lib/api";
import { formatBytes, fileEmoji } from "./lib/utils";
import { compressFile, decompressBlob } from "./lib/compression";
import { GithubIcon, XIcon } from "./components/ui/icons";
import { MAX_FILE_SIZE } from "shared";

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;

declare global {
  interface Window {
    turnstile?: {
      render: (selector: string, options: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      getResponse: (widgetId: string) => string | undefined;
      remove: (widgetId: string) => void;
      isExpired: (widgetId: string) => boolean;
      execute: (selector: string) => void;
    };
  }
}

type Tab = "upload" | "download";
type UploadState = "idle" | "selected" | "uploading" | "done" | "error";
type DownloadState = "idle" | "loading" | "found" | "error";
type ToastKind = "info" | "error";

function Toast({ msg, kind, visible }: { msg: string; kind: ToastKind; visible: boolean }) {
  if (!visible) return null;
  const Icon = kind === "error" ? AlertCircle : Check;
  return (
    <div className={`toast toast-${kind}`}>
      <Icon />
      {msg}
    </div>
  );
}

function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar-left">
        <a href="https://www.codemeoww.com" target="_blank" rel="noreferrer" className="navbar-parent-link">
          <ArrowUpRight />
          <span>codemeoww.com</span>
        </a>
        <span className="navbar-sep">/</span>
        <span className="navbar-crumb">whisk</span>
      </div>

      <a href="/" className="navbar-center">
        {/* <img src="/whisk-logo.png" alt="" className="navbar-logo" /> */}
        <span className="navbar-name">Whisk</span>
      </a>

      <div className="navbar-right">
        <a
          href="https://github.com/himanshujain112/whisk"
          target="_blank"
          rel="noreferrer"
          className="github-btn"
          id="github-source-btn"
        >
          <GithubIcon />
          <span>Source</span>
        </a>
      </div>
    </nav>
  );
}

function UploadPanel({ onToast }: { onToast: (m: string, k: ToastKind) => void }) {
  const [state, setState] = useState<UploadState>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [dragover, setDragover] = useState(false);
  const [widgetId, setWidgetId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);

  const pick = useCallback((f: File) => {
    // Reset input value so re-selecting the same file always fires onChange
    if (inputRef.current) inputRef.current.value = "";
    if (f.size > MAX_FILE_SIZE) { onToast(`File exceeds ${MAX_FILE_SIZE / 1024 / 1024} MB limit`, "error"); return; }
    setFile(f);
    setState("selected");
  }, [onToast]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragover(false);
    if (e.dataTransfer.files[0]) pick(e.dataTransfer.files[0]);
  }, [pick]);

  const upload = async () => {
    if (!file || !widgetId) return;
    const token = window.turnstile?.getResponse(widgetId);
    if (!token) {
      onToast("Please complete the Turnstile verification", "error");
      return;
    }
    setState("uploading"); setProgress(0);
    const iv = setInterval(() =>
      setProgress(p => (p >= 85 ? p : p + Math.random() * 11)), 200);
    try {
      const toUpload = await compressFile(file);
      const res = await uploadFile(toUpload, token);
      clearInterval(iv);
      if (!res.ok) throw Error();
      const data = (await res.json()) as { code: string };
      setProgress(100);
      await new Promise(r => setTimeout(r, 220));
      setCode(data.code.toUpperCase());
      setState("done");
    } catch {
      clearInterval(iv);
      setState("error");
      if (widgetId) {
        window.turnstile?.reset(widgetId);
      }
      onToast("Upload failed — please try again", "error");
    }
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    onToast("Code copied to clipboard", "info");
    setTimeout(() => setCopied(false), 2200);
  };

  const reset = () => {
    setState("idle"); setFile(null); setCode(""); setCopied(false); setProgress(0);
    if (widgetId) {
      window.turnstile?.reset(widgetId);
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  useEffect(() => {
    if (file && state === "selected" && !widgetId && turnstileRef.current) {
      const id = window.turnstile?.render("#turnstile-container", {
        sitekey: TURNSTILE_SITE_KEY,
        theme: "light",
        callback: function (token: string) {
          console.log("Turnstile verified:", token);
        },
      });
      if (id !== undefined) {
        setWidgetId(id);
      }
    }
  }, [file, state, widgetId]);

  if (state === "done" && code) {
    const chars = code.split("");
    return (
      <div className="panel">
        <div className="success-wrap">
          <div className="success-check"><CheckCircle /></div>
          <p className="success-label">Your share code</p>
          <div className="code-tiles">
            {chars.slice(0, 3).map((ch, i) => <div key={i} className="code-tile">{ch}</div>)}
            <div className="code-separator" />
            {chars.slice(3).map((ch, i) => <div key={i + 3} className="code-tile">{ch}</div>)}
          </div>
          <button className={`copy-btn${copied ? " copied" : ""}`} onClick={copyCode}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied!" : "Copy code"}
          </button>
          <p className="expire-note">
            <Clock /> This file auto-deletes in 1 hour
          </p>
        </div>
        <button className="btn btn-ghost" onClick={reset}>
          <RotateCcw /> Upload another file
        </button>
      </div>
    );
  }

  return (
    <div className="panel">
      {(state === "idle" || state === "error") && (
        <div
          className={`upload-zone${dragover ? " dragover" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragover(true); }}
          onDragLeave={() => setDragover(false)}
          onDrop={onDrop}
          id="upload-dropzone"
        >
          <div className="upload-zone-icon-wrap"><Upload /></div>
          <p className="upload-zone-title">
            {dragover ? "Drop to upload" : "Drag & drop your file here"}
          </p>
          <p className="upload-zone-sub">
            or <strong>click to browse</strong> · any format · max {MAX_FILE_SIZE / 1024 / 1024} MB
          </p>
          <input ref={inputRef} type="file" onChange={e => e.target.files?.[0] && pick(e.target.files[0])} />
        </div>
      )}

      {file && state === "selected" && (
        <>
          <div className="file-preview">
            <span className="file-emoji">{fileEmoji(file.type, file.name)}</span>
            <div className="file-info">
              <p className="file-name">{file.name}</p>
              <p className="file-size">{formatBytes(file.size)}</p>
            </div>
            <button className="file-remove" onClick={reset} title="Remove"><X /></button>
          </div>
          <div ref={turnstileRef} id="turnstile-container" style={{ margin: "20px 0", display: "flex", justifyContent: "center" }} />
        </>
      )}

      {state === "uploading" && file && (
        <div className="progress-block">
          <div className="file-preview" style={{ marginBottom: 0 }}>
            <span className="file-emoji">{fileEmoji(file.type, file.name)}</span>
            <div className="file-info">
              <p className="file-name">{file.name}</p>
              <p className="file-size">{formatBytes(file.size)}</p>
            </div>
          </div>
          <div className="progress-meta">
            <span>Uploading…</span>
            <span>{Math.round(Math.min(progress, 99))}%</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${Math.min(progress, 99)}%` }} />
          </div>
        </div>
      )}

      <button
        className="btn btn-primary"
        onClick={upload}
        disabled={state !== "selected"}
        id="upload-btn"
      >
        {state === "uploading"
          ? <><Clock style={{ animation: "spin 1s linear infinite" }} /> Uploading…</>
          : <><Upload /> Upload &amp; get code</>}
      </button>
    </div>
  );
}

function DownloadPanel({ onToast }: { onToast: (m: string, k: ToastKind) => void }) {
  const [input, setInput] = useState("");
  const [state, setDlState] = useState<DownloadState>("idle");
  const [info, setInfo] = useState<{
    filename: string;
    size: number;
    content_type: string;
    is_downloaded: number;
  } | null>(null);
  const [err, setErr] = useState("");

  // Display name — strip .gz so user sees the original filename
  const displayName = info?.filename.endsWith(".gz")
    ? info.filename.slice(0, -3)
    : info?.filename ?? "";

  const clean = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

  const lookup = useCallback(async (code = input) => {
    if (code.length !== 6) { setErr("Enter all 6 characters"); return; }
    setDlState("loading"); setErr("");
    try {
      const res = await validateCode(code.toLowerCase());
      if (!res.ok) { setDlState("error"); setErr("No file found for that code"); return; }
      const data = (await res.json()) as { filename: string; size: number; content_type: string; is_downloaded: number };
      setInfo(data); setDlState("found");
    } catch { setDlState("error"); setErr("Connection error — please retry"); }
  }, [input]);

  // Auto-verify the moment the 6th character is typed
  useEffect(() => {
    if (input.length === 6 && state === "idle") void lookup(input);
  }, [input, state, lookup]);

  const download = async () => {
    try {
      const res = await downloadFile(input.toLowerCase());
      if (!res.ok) throw Error();
      const rawBlob = await res.blob();
      const storedName = info?.filename ?? "file";
      const { blob, name } = await decompressBlob(rawBlob, storedName);
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement("a"), { href: url, download: name }).click();
      URL.revokeObjectURL(url);
      onToast("Download started!", "info");
    } catch { onToast("Download failed — try again", "error"); }
  };

  const clear = () => { setDlState("idle"); setInfo(null); setInput(""); setErr(""); };


  return (
    <div className="panel">
      <div>
        <label className="field-label" htmlFor="download-code-input">Share code</label>
        <div className="code-input-row">
          <input
            id="download-code-input"
            className={`code-input${err ? " input-error" : ""}`}
            type="text"
            placeholder="A1B2C3"
            maxLength={6}
            value={input}
            autoComplete="off" autoCorrect="off" spellCheck={false}
            onChange={e => {
              const v = clean(e.target.value);
              setInput(v);
              setErr("");
              if (state !== "idle" && state !== "loading") setDlState("idle");
            }}
            onKeyDown={e => e.key === "Enter" && state !== "loading" && lookup()}
          />
          <button
            className="btn btn-primary"
            style={{ width: "auto", padding: "0 18px", flexShrink: 0 }}
            onClick={state === "found" ? clear : () => lookup()}
            disabled={state === "loading" || input.length === 0}
            id="lookup-btn"
          >
            {state === "loading"
              ? <Clock style={{ animation: "spin 1s linear infinite" }} />
              : state === "found" ? <X /> : <Link />}
          </button>
        </div>
        {err && <p className="error-msg"><AlertCircle /> {err}</p>}
      </div>

      {state === "found" && info && (
        <div className="download-info-card">
          <div className="dl-file-row">
            <div className="dl-icon">{fileEmoji(info.content_type, displayName)}</div>
            <div className="dl-meta">
              <p className="dl-filename">{displayName}</p>
              <p className="dl-size">{formatBytes(info.size)}</p>
            </div>
          </div>
          <div className="dl-expiry">
            <Clock />
            {info.is_downloaded ? "Downloaded once already" : "Not yet downloaded"}
          </div>
        </div>
      )}

      <button className="btn btn-primary" onClick={download} disabled={state !== "found"} id="download-btn">
        <Download /> Download file
      </button>

      <div className="divider" />

      <p className="hint"><Shield /> Stored on Cloudflare R2 · Deleted after 1 hour</p>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("upload");
  const [toast, setToast] = useState({ msg: "", kind: "info" as ToastKind, visible: false });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onToast = useCallback((msg: string, kind: ToastKind) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ msg, kind, visible: true });
    timer.current = setTimeout(() => setToast(t => ({ ...t, visible: false })), 3000);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <div className="app">
      <Navbar />

      <main className="main">
        <div className="hero">
          <img src="/whisk-logo.png" alt="Whisk" className="hero-logo" />
          <h1 className="hero-title">Share files in seconds</h1>
          <p className="hero-sub">
            Upload any file, get a 6-character code.<br />
            Recipient enters the code — instant download.
          </p>
        </div>

        <div className="card">
          <div className="tabs">
            <button
              id="tab-upload"
              className={`tab-btn${tab === "upload" ? " tab-active" : ""}`}
              onClick={() => setTab("upload")}
            >
              <Upload /> Send a file
            </button>
            <button
              id="tab-download"
              className={`tab-btn${tab === "download" ? " tab-active" : ""}`}
              onClick={() => setTab("download")}
            >
              <Download /> Receive a file
            </button>
          </div>

          {tab === "upload"
            ? <UploadPanel onToast={onToast} />
            : <DownloadPanel onToast={onToast} />}
        </div>

        <div className="feat-pills">
          <div className="feat-pill"><Shield /> End-to-end Safe</div>
          <div className="feat-pill"><Clock /> 1-hour auto-delete</div>
          <div className="feat-pill"><Zap /> Up to {MAX_FILE_SIZE / 1024 / 1024} MB</div>
        </div>
      </main>

      <footer className="footer">
        <a href="https://codemeoww.com" target="_blank" rel="noreferrer" className="footer-link">
          <ArrowUpRight /> codemeoww.com
        </a>
        <div className="footer-dot" />
        <a href="https://x.com/codemeoww" target="_blank" rel="noreferrer" className="footer-link">
          <XIcon /> @codemeoww
        </a>
        <div className="footer-dot" />
        <a href="https://github.com/himanshujain112/whisk" target="_blank" rel="noreferrer" className="footer-link">
          <GithubIcon size={12} /> GitHub
        </a>
      </footer>

      <Toast msg={toast.msg} kind={toast.kind} visible={toast.visible} />
    </div>
  );
}
