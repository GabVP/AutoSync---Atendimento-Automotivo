import { FormEvent, useEffect, useMemo, useState } from "react";

type Service = {
  id: number;
  title: string;
  duration_minutes: number;
};

type RequestConfirmation = {
  id: number;
  status: "PENDENTE";
  tracking_code: string;
  service_title: string;
  created_at: string;
};

type TrackingResult = {
  tracking_code: string;
  status: "PENDENTE" | "CONFIRMADO" | "CANCELADO";
  service_title: string;
  vehicle_make: string;
  vehicle_model: string;
  created_at: string;
  updated_at: string;
};

type FormValues = {
  name: string;
  phone: string;
  email: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_plate: string;
  service_id: string;
  description: string;
  preference: string;
  accepts_terms: boolean;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";
const trackingCodePattern = /^ATS-[A-F0-9]{8}$/;

const emptyForm: FormValues = {
  name: "",
  phone: "",
  email: "",
  vehicle_make: "",
  vehicle_model: "",
  vehicle_plate: "",
  service_id: "",
  description: "",
  preference: "",
  accepts_terms: false,
};

const serviceIcons: Record<string, string> = {
  "Troca de óleo": "◒",
  "Revisão preventiva": "◎",
  "Alinhamento e balanceamento": "◌",
  "Diagnóstico eletrônico": "⌘",
};

function displayDuration(durationMinutes: number): string {
  if (durationMinutes < 60) {
    return `A partir de ${durationMinutes} min`;
  }
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  return minutes ? `A partir de ${hours}h ${minutes}min` : `A partir de ${hours} hora`;
}

function displayStatus(status: TrackingResult["status"]): string {
  return {
    PENDENTE: "Pendente de confirmação",
    CONFIRMADO: "Atendimento confirmado",
    CANCELADO: "Solicitação cancelada",
  }[status];
}

function App() {
  const [services, setServices] = useState<Service[]>([]);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<RequestConfirmation | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [trackingCode, setTrackingCode] = useState("");
  const [trackingResult, setTrackingResult] = useState<TrackingResult | null>(null);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [isTracking, setIsTracking] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadServices() {
      try {
        const response = await fetch(`${apiBaseUrl}/services`);
        if (!response.ok) {
          throw new Error("Não foi possível carregar os serviços.");
        }
        const loadedServices = (await response.json()) as Service[];
        if (isMounted) {
          setServices(loadedServices);
        }
      } catch {
        if (isMounted) {
          setServiceError("Não foi possível carregar os serviços agora. Tente novamente em instantes.");
        }
      }
    }

    void loadServices();
    return () => {
      isMounted = false;
    };
  }, []);

  const selectedService = useMemo(
    () => services.find((service) => service.id === Number(form.service_id)),
    [form.service_id, services],
  );

  function updateField<Key extends keyof FormValues>(key: Key, value: FormValues[Key]) {
    setForm((currentForm) => ({ ...currentForm, [key]: value }));
    setFieldErrors((currentErrors) => ({ ...currentErrors, [key]: undefined }));
  }

  function validateForm(): boolean {
    const nextErrors: Partial<Record<keyof FormValues, string>> = {};
    const requiredFields: Array<[keyof FormValues, string]> = [
      ["name", "Informe seu nome."],
      ["phone", "Informe seu telefone."],
      ["vehicle_make", "Informe a marca do veículo."],
      ["vehicle_model", "Informe o modelo do veículo."],
      ["vehicle_plate", "Informe a placa do veículo."],
      ["service_id", "Selecione um serviço."],
      ["description", "Conte brevemente o que está acontecendo."],
    ];

    for (const [field, message] of requiredFields) {
      if (!String(form[field]).trim()) {
        nextErrors[field] = message;
      }
    }
    if (!form.accepts_terms) {
      nextErrors.accepts_terms = "Você precisa aceitar os termos para enviar a solicitação.";
    }
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) {
      nextErrors.email = "Informe um e-mail válido ou deixe o campo vazio.";
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmissionError(null);
    setConfirmation(null);

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${apiBaseUrl}/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || null,
          vehicle_make: form.vehicle_make.trim(),
          vehicle_model: form.vehicle_model.trim(),
          vehicle_plate: form.vehicle_plate.trim().toUpperCase(),
          service_id: Number(form.service_id),
          description: form.description.trim(),
          preference: form.preference.trim() || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Não foi possível enviar sua solicitação. Revise os dados e tente novamente.");
      }

      const createdRequest = (await response.json()) as RequestConfirmation;
      setConfirmation(createdRequest);
      setForm(emptyForm);
    } catch (error) {
      setSubmissionError(
        error instanceof Error
          ? error.message
          : "Não foi possível enviar sua solicitação. Tente novamente.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function trackRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedTrackingCode = trackingCode.trim().toUpperCase();
    setTrackingError(null);
    setTrackingResult(null);

    if (!trackingCodePattern.test(normalizedTrackingCode)) {
      setTrackingError("Use o código no formato ATS-XXXXXXXX para acompanhar sua solicitação.");
      return;
    }

    setIsTracking(true);
    try {
      const response = await fetch(
        `${apiBaseUrl}/requests/${encodeURIComponent(normalizedTrackingCode)}`,
      );
      if (!response.ok) {
        throw new Error("Não encontramos uma solicitação com esse código. Confira e tente novamente.");
      }

      const trackedRequest = (await response.json()) as TrackingResult;
      setTrackingCode(normalizedTrackingCode);
      setTrackingResult(trackedRequest);
    } catch (error) {
      setTrackingError(
        error instanceof Error
          ? error.message
          : "Não foi possível consultar a solicitação agora. Tente novamente.",
      );
    } finally {
      setIsTracking(false);
    }
  }

  return (
    <div className="site-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="AutoSync - início">
          <span className="brand-mark" aria-hidden="true"><i /><i /></span>
          <span><strong>AutoSync</strong><small>SEU CARRO SEMPRE EM MOVIMENTO</small></span>
        </a>
        <nav aria-label="Navegação principal">
          <a href="#services">Serviços</a>
          <a href="#how-it-works">Como funciona</a>
          <a href="#tracking">Acompanhar pedido</a>
          <a href="#manager">Área do gestor</a>
        </nav>
        <a className="button button--small" href="#request">▣&nbsp; Solicitar atendimento</a>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="page-title">
          <div className="hero__copy">
            <p className="eyebrow eyebrow--light">MANUTENÇÃO QUE TE LEVA MAIS LONGE</p>
            <h1 id="page-title">Solicitar atendimento</h1>
            <p className="hero__summary">
              Preencha seus dados e envie sua solicitação. Nossa equipe vai analisar e confirmar
              seu atendimento o mais breve possível.
            </p>
            <ul className="hero__benefits" aria-label="Benefícios do atendimento">
              <li>◉ Atendimento especializado</li>
              <li>◷ Resposta rápida</li>
              <li>▱ Seu carro em boas mãos</li>
            </ul>
          </div>
          <div className="hero__mechanic" aria-hidden="true">
            <span className="hero__mechanic-glow" />
            <span className="hero__mechanic-wheel" />
            <span className="hero__mechanic-line" />
          </div>
        </section>

        <section className="request-layout" id="request" aria-label="Solicitação de atendimento">
          <aside className="services-panel" id="services">
            <p className="eyebrow">ESCOLHA O MELHOR PARA O SEU CARRO</p>
            <h2>Nossos principais serviços</h2>
            <p className="section-intro">
              Manutenção com qualidade, equipamentos modernos e uma equipe que entende de verdade de carros.
            </p>

            {serviceError ? <p className="notice notice--error">{serviceError}</p> : null}
            {!serviceError && services.length === 0 ? <p className="notice">Carregando serviços…</p> : null}
            <div className="service-grid">
              {services.map((service) => (
                <button
                  className={`service-card ${String(service.id) === form.service_id ? "service-card--selected" : ""}`}
                  key={service.id}
                  onClick={() => updateField("service_id", String(service.id))}
                  type="button"
                >
                  <span className="service-card__art" aria-hidden="true">{serviceIcons[service.title] ?? "✦"}</span>
                  <span className="service-card__body">
                    <strong>{service.title}</strong>
                    <small>{displayDuration(service.duration_minutes)}</small>
                  </span>
                  <span className="service-card__arrow" aria-hidden="true">→</span>
                </button>
              ))}
            </div>

            <div className="steps" id="how-it-works">
              <p className="eyebrow">COMO FUNCIONA</p>
              <h2>Do pedido ao atendimento.</h2>
              <ol>
                <li><b>01</b><strong>Você solicita</strong><span>Preencha os dados do seu carro e do serviço.</span></li>
                <li><b>02</b><strong>Nossa equipe analisa</strong><span>Vamos revisar sua solicitação e entrar em contato.</span></li>
                <li><b>03</b><strong>Confirmamos</strong><span>Você recebe a confirmação com os detalhes.</span></li>
                <li><b>04</b><strong>Seu carro em boas mãos</strong><span>Atendimento com qualidade e transparência.</span></li>
              </ol>
            </div>
          </aside>

          <section className="form-card" aria-labelledby="form-title">
            <p className="eyebrow">SOLICITAÇÃO DE ATENDIMENTO</p>
            <h2 id="form-title">Seus dados e informações do serviço</h2>
            <p className="section-intro">Campos marcados com <b>*</b> são obrigatórios.</p>

            <form noValidate onSubmit={submitRequest}>
              <div className="form-grid">
                <label>
                  Nome <em aria-hidden="true">*</em>
                  <input aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? "name-error" : undefined} onChange={(event) => updateField("name", event.target.value)} placeholder="Ex.: João Silva" value={form.name} />
                  {fieldErrors.name ? <small className="field-error" id="name-error">{fieldErrors.name}</small> : null}
                </label>
                <label>
                  Telefone <em aria-hidden="true">*</em>
                  <input aria-invalid={Boolean(fieldErrors.phone)} inputMode="tel" onChange={(event) => updateField("phone", event.target.value)} placeholder="(11) 91234-5678" value={form.phone} />
                  {fieldErrors.phone ? <small className="field-error">{fieldErrors.phone}</small> : null}
                </label>
                <label>
                  E-mail <span>(opcional)</span>
                  <input aria-invalid={Boolean(fieldErrors.email)} onChange={(event) => updateField("email", event.target.value)} placeholder="exemplo@seuemail.com" type="email" value={form.email} />
                  {fieldErrors.email ? <small className="field-error">{fieldErrors.email}</small> : null}
                </label>
                <div className="vehicle-fields">
                  <label>
                    Marca <em aria-hidden="true">*</em>
                    <input aria-invalid={Boolean(fieldErrors.vehicle_make)} onChange={(event) => updateField("vehicle_make", event.target.value)} placeholder="Ex.: Toyota" value={form.vehicle_make} />
                  </label>
                  <label>
                    Modelo <em aria-hidden="true">*</em>
                    <input aria-invalid={Boolean(fieldErrors.vehicle_model)} onChange={(event) => updateField("vehicle_model", event.target.value)} placeholder="Ex.: Corolla" value={form.vehicle_model} />
                  </label>
                  {fieldErrors.vehicle_make || fieldErrors.vehicle_model ? <small className="field-error">Informe marca e modelo do veículo.</small> : null}
                </div>
                <label>
                  Placa <em aria-hidden="true">*</em>
                  <input aria-invalid={Boolean(fieldErrors.vehicle_plate)} onChange={(event) => updateField("vehicle_plate", event.target.value)} placeholder="Ex.: ABC1D23" value={form.vehicle_plate} />
                  {fieldErrors.vehicle_plate ? <small className="field-error">{fieldErrors.vehicle_plate}</small> : null}
                </label>
                <label>
                  Serviço <em aria-hidden="true">*</em>
                  <select aria-invalid={Boolean(fieldErrors.service_id)} onChange={(event) => updateField("service_id", event.target.value)} value={form.service_id}>
                    <option value="">Selecione um serviço</option>
                    {services.map((service) => <option key={service.id} value={service.id}>{service.title}</option>)}
                  </select>
                  {fieldErrors.service_id ? <small className="field-error">{fieldErrors.service_id}</small> : null}
                </label>
                <label className="form-grid__full">
                  Descrição <em aria-hidden="true">*</em>
                  <textarea aria-invalid={Boolean(fieldErrors.description)} maxLength={1000} onChange={(event) => updateField("description", event.target.value)} placeholder="Conte o que está acontecendo com seu carro…" rows={4} value={form.description} />
                  <small className="character-count">{form.description.length}/1000</small>
                  {fieldErrors.description ? <small className="field-error">{fieldErrors.description}</small> : null}
                </label>
                <label className="form-grid__full">
                  Preferência de atendimento <span>(opcional)</span>
                  <input onChange={(event) => updateField("preference", event.target.value)} placeholder="Ex.: Período da manhã, dia específico, observações" value={form.preference} />
                </label>
              </div>

              <label className="terms">
                <input checked={form.accepts_terms} onChange={(event) => updateField("accepts_terms", event.target.checked)} type="checkbox" />
                <span>Concordo com os <a href="#terms">Termos de Uso</a> e a <a href="#privacy">Política de Privacidade</a> da AutoSync. <em aria-hidden="true">*</em></span>
              </label>
              {fieldErrors.accepts_terms ? <p className="field-error">{fieldErrors.accepts_terms}</p> : null}
              {submissionError ? <p className="notice notice--error" role="alert">{submissionError}</p> : null}
              <button className="button button--submit" disabled={isSubmitting} type="submit">
                {isSubmitting ? "Enviando solicitação…" : "➤  Enviar solicitação"}
              </button>
            </form>

            {confirmation ? (
              <section className="confirmation" aria-live="polite">
                <span className="confirmation__check" aria-hidden="true">✓</span>
                <div>
                  <p>SOLICITAÇÃO ENVIADA</p>
                  <h3>Solicitação recebida com sucesso!</h3>
                  <span>Pedido recebido como {confirmation.status}.</span>
                </div>
                <div className="confirmation__code">
                  <small>Código de acompanhamento</small>
                  <strong>{confirmation.tracking_code}</strong>
                  <a href="#tracking">Acompanhar pedido →</a>
                </div>
              </section>
            ) : null}
          </section>
        </section>

        <section className="tracking-section" id="tracking" aria-labelledby="tracking-title">
          <div>
            <p className="eyebrow">ACOMPANHAMENTO</p>
            <h2 id="tracking-title">Consulte sua solicitação</h2>
            <p className="section-intro">
              Informe o código enviado depois do cadastro para ver o status atual do seu pedido.
            </p>
          </div>
          <div className="tracking-card">
            <form className="tracking-form" noValidate onSubmit={trackRequest}>
              <label>
                Código de acompanhamento
                <input
                  aria-describedby={trackingError ? "tracking-error" : undefined}
                  aria-invalid={Boolean(trackingError)}
                  autoCapitalize="characters"
                  onChange={(event) => setTrackingCode(event.target.value)}
                  placeholder="Ex.: ATS-AB12CD34"
                  value={trackingCode}
                />
              </label>
              <button className="button" disabled={isTracking} type="submit">
                {isTracking ? "Consultando…" : "Acompanhar solicitação"}
              </button>
            </form>
            {trackingError ? <p className="notice notice--error" id="tracking-error" role="alert">{trackingError}</p> : null}
            {trackingResult ? (
              <section className="tracking-result" aria-live="polite">
                <div>
                  <p className="eyebrow">SOLICITAÇÃO ENCONTRADA</p>
                  <h3>{trackingResult.service_title}</h3>
                  <span>{trackingResult.vehicle_make} {trackingResult.vehicle_model}</span>
                </div>
                <div className="tracking-result__status">
                  <small>Status atual</small>
                  <strong className={`tracking-status tracking-status--${trackingResult.status.toLowerCase()}`}>
                    {displayStatus(trackingResult.status)}
                  </strong>
                </div>
              </section>
            ) : null}
          </div>
        </section>
      </main>

      <footer>
        <a className="brand brand--footer" href="#top"><span className="brand-mark" aria-hidden="true"><i /><i /></span><span><strong>AutoSync</strong><small>SEU CARRO SEMPRE EM MOVIMENTO</small></span></a>
        <p>Confiabilidade hoje.<br />Mais estrada amanhã.</p>
        <div><b>Contato</b><span>(11) 4000-1234</span><span>contato@autosync.com.br</span><span>São Paulo - SP</span></div>
        <a className="footer-tracking" href="#tracking">Acompanhe cada etapa<br />com transparência.</a>
        <p id="manager">AutoSync.<br />Movimento faz bem.</p>
      </footer>
    </div>
  );
}

export default App;
