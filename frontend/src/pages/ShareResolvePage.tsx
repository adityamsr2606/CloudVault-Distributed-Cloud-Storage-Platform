import { Download, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import LiveBackdrop from "../components/LiveBackdrop";
import { resolveShareLink } from "../lib/cloudvault";

type ShareState = "checking" | "ready" | "error";

export default function ShareResolvePage() {
  const { token = "" } = useParams();
  const [file, setFile] = useState<Awaited<ReturnType<typeof resolveShareLink>> | null>(null);
  const [state, setState] = useState<ShareState>("checking");
  const [message, setMessage] = useState("Verifying secure link…");

  useEffect(() => {
    setState("checking");
    setMessage("Verifying secure link…");

    void resolveShareLink(token)
      .then((data) => {
        setFile(data);
        setState("ready");
        setMessage("");
      })
      .catch(() => {
        setFile(null);
        setState("error");
        setMessage("This share link is invalid, expired, exhausted, or revoked.");
      });
  }, [token]);

  return (
    <div className="share-resolve-page">
      <LiveBackdrop />
      <section className="share-resolve-card glass-panel">
        <ShieldCheck size={26} />
        <p className="eyebrow">CloudVault secure share</p>
        {state === "ready" && file ? (
          <>
            <h1>{file.name}</h1>
            <p>{file.mime_type} · access URL expires in 10 minutes.</p>
            <a className="primary-button" href={file.signed_url}>
              <Download size={16} /> Download file
            </a>
          </>
        ) : (
          <>
            <h1>{state === "error" ? "Share unavailable" : "Checking access"}</h1>
            <p>{message}</p>
          </>
        )}
      </section>
    </div>
  );
}
