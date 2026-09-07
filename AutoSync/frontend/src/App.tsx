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

type RequestStatus = "PENDENTE" | "CONFIRMADO" | "CANCELADO";

type OperationalStatus = "AGENDADO" | "EM_ANDAMENTO" | "ATRASADO" | "CONCLUÍDO";

type TrackingResult = {
  tracking_code: string;
  status: RequestStatus;
  service_title: string;
  vehicle_make: string;
  vehicle_model: string;
  created_at: string;
  updated_at: string;
};

type AdministratorRequestSummary = {
  id: number;
  name: string;
  email: string | null;
  phone: string;
  service_title: string;
  status: RequestStatus;
  tracking_code: string;
  created_at: string;
  operational_status: OperationalStatus | null;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  workshop_box_label: string | null;
  employee_name: string | null;
};

type AdministratorRequestPage = {
  items: AdministratorRequestSummary[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

type AdministratorRequestStatusResponse = {
  id: number;
  status: RequestStatus;
};

type AdministratorRequestActionStatus = "CANCELADO";

type AdministratorSchedulingSuggestion = {
  request_id: number;
  workshop_box_id: number;
  workshop_box_label: string;
  employee_id: number;
  employee_name: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
};

type AdministratorSchedulingConfirmation = {
  id: number;
  status: "CONFIRMADO";
  operational_status: "AGENDADO";
  workshop_box_id: number;
  workshop_box_label: string;
  employee_id: number;
  employee_name: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
};

type AdministratorService = Service & {
  is_active: boolean;
};

type AdministratorWorkshopResource = {
  id: number;
  label?: string;
  name?: string;
  is_active: boolean;
};

type WorkshopResourceValueField = "label" | "name";

type WorkshopResourceConfiguration = {
  kind: "box" | "employee";
  collectionLabel: string;
  singularLabel: string;
  endpoint: "boxes" | "employees";
  inputLabel: string;
  valueField: WorkshopResourceValueField;
};

type ApplicationPath = "/" | "/login" | "/admin";

type AdministratorSession = {
  accessToken: string;
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
const administratorSessionStorageKey = "autosync.administrator-session";

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

const emptyAdministratorServiceForm = {
  title: "",
  durationMinutes: "",
};

const workshopBoxConfiguration: WorkshopResourceConfiguration = {
  kind: "box",
  collectionLabel: "Boxes",
  singularLabel: "box",
  endpoint: "boxes",
  inputLabel: "Identificação do box",
  valueField: "label",
};

const employeeConfiguration: WorkshopResourceConfiguration = {
  kind: "employee",
  collectionLabel: "Funcionários",
  singularLabel: "funcionário",
  endpoint: "employees",
  inputLabel: "Nome do funcionário",
  valueField: "name",
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

function displayStatus(status: RequestStatus): string {
  return {
    PENDENTE: "Pendente de confirmação",
    CONFIRMADO: "Atendimento confirmado",
    CANCELADO: "Solicitação cancelada",
  }[status];
}

function displayOperationalStatus(status: OperationalStatus): string {
  return {
    AGENDADO: "Agendado",
    EM_ANDAMENTO: "Em andamento",
    ATRASADO: "Atrasado",
    CONCLUÍDO: "Concluído",
  }[status];
}

function toDatetimeLocalValue(date: string): string {
  return date.slice(0, 16);
}

function currentApplicationPath(): ApplicationPath {
  if (window.location.pathname === "/login") {
    return "/login";
  }
  if (window.location.pathname === "/admin") {
    return "/admin";
  }
  return "/";
}

function loadAdministratorSession(): AdministratorSession | null {
  const storedSession = window.localStorage.getItem(administratorSessionStorageKey);
  if (!storedSession) {
    return null;
  }

  try {
    const parsedSession = JSON.parse(storedSession) as AdministratorSession;
    return parsedSession.accessToken ? parsedSession : null;
  } catch {
    window.localStorage.removeItem(administratorSessionStorageKey);
    return null;
  }
}

type LoginPageProps = {
  onAuthenticated: (accessToken: string) => void;
  onNavigateHome: () => void;
};

function LoginPage({ onAuthenticated, onNavigateHome }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);

    try {
      const response = await fetch(`${apiBaseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!response.ok) {
        throw new Error("E-mail ou senha inválidos. Tente novamente.");
      }

      const authenticatedSession = (await response.json()) as { access_token: string };
      if (!authenticatedSession.access_token) {
        throw new Error("Não foi possível iniciar sua sessão. Tente novamente.");
      }

      onAuthenticated(authenticatedSession.access_token);
    } catch (error) {
      setLoginError(
        error instanceof Error ? error.message : "Não foi possível iniciar sua sessão. Tente novamente.",
      );
    } finally {
      setIsLoggingIn(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-title">
        <button className="auth-card__brand" onClick={onNavigateHome} type="button">
          <span className="brand-mark" aria-hidden="true"><i /><i /></span>
          <span><strong>AutoSync</strong><small>ÁREA ADMINISTRATIVA</small></span>
        </button>
        <p className="eyebrow">ACESSO RESTRITO</p>
        <h1 id="login-title">Acesso do gestor</h1>
        <p>Entre com as credenciais do administrador para acompanhar as solicitações.</p>
        <form className="auth-form" onSubmit={submitLogin}>
          <label>
            E-mail
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            Senha
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {loginError ? <p className="notice notice--error" role="alert">{loginError}</p> : null}
          <button className="button" disabled={isLoggingIn} type="submit">
            {isLoggingIn ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <button className="auth-card__back" onClick={onNavigateHome} type="button">← Voltar para a AutoSync</button>
      </section>
    </main>
  );
}

type AdministratorPanelProps = {
  accessToken: string;
  onLogout: () => void;
};

type AdministratorServicesProps = AdministratorPanelProps;

type AdministratorWorkshopResourceManagerProps = AdministratorPanelProps & {
  configuration: WorkshopResourceConfiguration;
};

function formatRequestDate(date: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(date));
}

function AdministratorServices({ accessToken, onLogout }: AdministratorServicesProps) {
  const [services, setServices] = useState<AdministratorService[]>([]);
  const [title, setTitle] = useState(emptyAdministratorServiceForm.title);
  const [durationMinutes, setDurationMinutes] = useState(emptyAdministratorServiceForm.durationMinutes);
  const [editingService, setEditingService] = useState<AdministratorService | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [serviceBeingDeactivated, setServiceBeingDeactivated] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadServices() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${apiBaseUrl}/admin/services`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (response.status === 401) {
          if (isMounted) {
            onLogout();
          }
          return;
        }
        if (!response.ok) {
          throw new Error("Não foi possível carregar os serviços.");
        }

        const loadedServices = (await response.json()) as AdministratorService[];
        if (isMounted) {
          setServices(loadedServices);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(
            loadError instanceof Error ? loadError.message : "Não foi possível carregar os serviços.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadServices();
    return () => {
      isMounted = false;
    };
  }, [accessToken, onLogout]);

  function resetForm() {
    setTitle(emptyAdministratorServiceForm.title);
    setDurationMinutes(emptyAdministratorServiceForm.durationMinutes);
    setEditingService(null);
  }

  function editService(service: AdministratorService) {
    setTitle(service.title);
    setDurationMinutes(String(service.duration_minutes));
    setEditingService(service);
    setError(null);
    setFeedback(null);
  }

  async function submitService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedTitle = title.trim();
    const normalizedDuration = Number(durationMinutes);
    if (!normalizedTitle || !Number.isInteger(normalizedDuration) || normalizedDuration <= 0) {
      setError("Informe um nome e uma duração válida em minutos.");
      setFeedback(null);
      return;
    }

    const isEditing = editingService !== null;
    setError(null);
    setFeedback(null);
    setIsSaving(true);

    try {
      const response = await fetch(
        isEditing
          ? `${apiBaseUrl}/admin/services/${editingService.id}`
          : `${apiBaseUrl}/admin/services`,
        {
          method: isEditing ? "PATCH" : "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title: normalizedTitle, duration_minutes: normalizedDuration }),
        },
      );
      if (response.status === 401) {
        onLogout();
        return;
      }
      if (!response.ok) {
        throw new Error(`Não foi possível ${isEditing ? "atualizar" : "criar"} o serviço.`);
      }

      const savedService = (await response.json()) as AdministratorService;
      setServices((currentServices) => (
        isEditing
          ? currentServices.map((service) => service.id === savedService.id ? savedService : service)
          : [...currentServices, savedService]
      ));
      setFeedback(`Serviço ${savedService.title} ${isEditing ? "atualizado" : "criado"}.`);
      resetForm();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : `Não foi possível ${isEditing ? "atualizar" : "criar"} o serviço.`,
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deactivateService(service: AdministratorService) {
    setError(null);
    setFeedback(null);
    setServiceBeingDeactivated(service.id);

    try {
      const response = await fetch(`${apiBaseUrl}/admin/services/${service.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ is_active: false }),
      });
      if (response.status === 401) {
        onLogout();
        return;
      }
      if (!response.ok) {
        throw new Error("Não foi possível desativar o serviço.");
      }

      const updatedService = (await response.json()) as AdministratorService;
      setServices((currentServices) => currentServices.map((currentService) => (
        currentService.id === updatedService.id ? updatedService : currentService
      )));
      setFeedback(`Serviço ${updatedService.title} desativado.`);
      if (editingService?.id === updatedService.id) {
        resetForm();
      }
    } catch (deactivationError) {
      setError(
        deactivationError instanceof Error
          ? deactivationError.message
          : "Não foi possível desativar o serviço.",
      );
    } finally {
      setServiceBeingDeactivated(null);
    }
  }

  return (
    <section className="admin-services" aria-labelledby="admin-services-title">
      <div className="admin-services__heading">
        <p className="eyebrow">CATÁLOGO DE ATENDIMENTO</p>
        <h2 id="admin-services-title">Gerenciar serviços</h2>
        <p>Cadastre, atualize ou desative serviços. Os inativos permanecem no histórico e deixam de aparecer para o cliente.</p>
      </div>

      <div className="admin-services__content">
        <form className="admin-service-form" onSubmit={submitService}>
          <h3>{editingService ? "Editar serviço" : "Novo serviço"}</h3>
          <label>
            Nome do serviço
            <input
              onChange={(event) => setTitle(event.target.value)}
              required
              value={title}
            />
          </label>
          <label>
            Duração estimada (minutos)
            <input
              min="1"
              onChange={(event) => setDurationMinutes(event.target.value)}
              required
              step="1"
              type="number"
              value={durationMinutes}
            />
          </label>
          {error ? <p className="notice notice--error" role="alert">{error}</p> : null}
          {feedback ? <p className="notice notice--success" role="status">{feedback}</p> : null}
          <div className="admin-service-form__actions">
            <button className="button" disabled={isSaving} type="submit">
              {isSaving ? "Salvando…" : editingService ? "Salvar alterações" : "Adicionar serviço"}
            </button>
            {editingService ? (
              <button className="admin-service-form__cancel" onClick={resetForm} type="button">Cancelar edição</button>
            ) : null}
          </div>
        </form>

        <div className="admin-table-wrap">
          {isLoading ? <p className="notice">Carregando serviços…</p> : null}
          {!isLoading && !error && services.length === 0 ? <p className="notice">Nenhum serviço cadastrado.</p> : null}
          {!isLoading && !error && services.length ? (
            <table className="admin-table admin-services-table">
              <caption>{services.length} serviços cadastrados</caption>
              <thead>
                <tr>
                  <th scope="col">Serviço</th>
                  <th scope="col">Duração</th>
                  <th scope="col">Status</th>
                  <th scope="col">Ações</th>
                </tr>
              </thead>
              <tbody>
                {services.map((service) => (
                  <tr key={service.id}>
                    <td><strong>{service.title}</strong></td>
                    <td>{displayDuration(service.duration_minutes)}</td>
                    <td>
                      <strong className={`admin-service-status admin-service-status--${service.is_active ? "active" : "inactive"}`}>
                        {service.is_active ? "Ativo" : "Inativo"}
                      </strong>
                    </td>
                    <td>
                      <div className="admin-actions">
                        <button
                          aria-label={`Editar serviço ${service.title}`}
                          className="admin-action admin-action--edit"
                          disabled={isSaving || serviceBeingDeactivated === service.id}
                          onClick={() => editService(service)}
                          type="button"
                        >
                          Editar
                        </button>
                        {service.is_active ? (
                          <button
                            aria-label={`Desativar serviço ${service.title}`}
                            className="admin-action admin-action--deactivate"
                            disabled={isSaving || serviceBeingDeactivated === service.id}
                            onClick={() => void deactivateService(service)}
                            type="button"
                          >
                            {serviceBeingDeactivated === service.id ? "Desativando…" : "Desativar"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function workshopResourceValue(
  resource: AdministratorWorkshopResource,
  configuration: WorkshopResourceConfiguration,
): string {
  return resource[configuration.valueField] ?? "";
}

function workshopResourceDescription(
  configuration: WorkshopResourceConfiguration,
  value: string,
): string {
  return configuration.kind === "box" ? value : `Funcionário ${value}`;
}

function AdministratorWorkshopResourceManager({
  accessToken,
  configuration,
  onLogout,
}: AdministratorWorkshopResourceManagerProps) {
  const [resources, setResources] = useState<AdministratorWorkshopResource[]>([]);
  const [value, setValue] = useState("");
  const [editingResource, setEditingResource] = useState<AdministratorWorkshopResource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [resourceBeingDeactivated, setResourceBeingDeactivated] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadResources() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${apiBaseUrl}/admin/${configuration.endpoint}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (response.status === 401) {
          if (isMounted) {
            onLogout();
          }
          return;
        }
        if (!response.ok) {
          throw new Error(`Não foi possível carregar os ${configuration.collectionLabel.toLowerCase()}.`);
        }

        const loadedResources = (await response.json()) as AdministratorWorkshopResource[];
        if (isMounted) {
          setResources(loadedResources);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : `Não foi possível carregar os ${configuration.collectionLabel.toLowerCase()}.`,
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadResources();
    return () => {
      isMounted = false;
    };
  }, [accessToken, configuration, onLogout]);

  function resetForm() {
    setValue("");
    setEditingResource(null);
  }

  function editResource(resource: AdministratorWorkshopResource) {
    setValue(workshopResourceValue(resource, configuration));
    setEditingResource(resource);
    setError(null);
    setFeedback(null);
  }

  async function submitResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedValue = value.trim();
    if (!normalizedValue) {
      setError(`Informe ${configuration.inputLabel.toLowerCase()}.`);
      setFeedback(null);
      return;
    }

    const isEditing = editingResource !== null;
    setError(null);
    setFeedback(null);
    setIsSaving(true);

    try {
      const response = await fetch(
        isEditing
          ? `${apiBaseUrl}/admin/${configuration.endpoint}/${editingResource.id}`
          : `${apiBaseUrl}/admin/${configuration.endpoint}`,
        {
          method: isEditing ? "PATCH" : "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ [configuration.valueField]: normalizedValue }),
        },
      );
      if (response.status === 401) {
        onLogout();
        return;
      }
      if (!response.ok) {
        throw new Error(`Não foi possível ${isEditing ? "atualizar" : "criar"} o ${configuration.singularLabel}.`);
      }

      const savedResource = (await response.json()) as AdministratorWorkshopResource;
      setResources((currentResources) => (
        isEditing
          ? currentResources.map((resource) => resource.id === savedResource.id ? savedResource : resource)
          : [...currentResources, savedResource]
      ));
      const savedDescription = workshopResourceDescription(
        configuration,
        workshopResourceValue(savedResource, configuration),
      );
      setFeedback(`${savedDescription} ${isEditing ? "atualizado" : "criado"}.`);
      resetForm();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : `Não foi possível ${isEditing ? "atualizar" : "criar"} o ${configuration.singularLabel}.`,
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deactivateResource(resource: AdministratorWorkshopResource) {
    setError(null);
    setFeedback(null);
    setResourceBeingDeactivated(resource.id);

    try {
      const response = await fetch(`${apiBaseUrl}/admin/${configuration.endpoint}/${resource.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ is_active: false }),
      });
      if (response.status === 401) {
        onLogout();
        return;
      }
      if (!response.ok) {
        throw new Error(`Não foi possível desativar o ${configuration.singularLabel}.`);
      }

      const updatedResource = (await response.json()) as AdministratorWorkshopResource;
      setResources((currentResources) => currentResources.map((currentResource) => (
        currentResource.id === updatedResource.id ? updatedResource : currentResource
      )));
      const updatedDescription = workshopResourceDescription(
        configuration,
        workshopResourceValue(updatedResource, configuration),
      );
      setFeedback(`${updatedDescription} desativado.`);
      if (editingResource?.id === updatedResource.id) {
        resetForm();
      }
    } catch (deactivationError) {
      setError(
        deactivationError instanceof Error
          ? deactivationError.message
          : `Não foi possível desativar o ${configuration.singularLabel}.`,
      );
    } finally {
      setResourceBeingDeactivated(null);
    }
  }

  return (
    <section className="admin-workshop-resource" aria-labelledby={`admin-${configuration.kind}-title`}>
      <h3 id={`admin-${configuration.kind}-title`}>{configuration.collectionLabel}</h3>
      <form className="admin-service-form" onSubmit={submitResource}>
        <label>
          {configuration.inputLabel}
          <input
            minLength={2}
            onChange={(event) => setValue(event.target.value)}
            required
            value={value}
          />
        </label>
        {error ? <p className="notice notice--error" role="alert">{error}</p> : null}
        {feedback ? <p className="notice notice--success" role="status">{feedback}</p> : null}
        <div className="admin-service-form__actions">
          <button className="button" disabled={isSaving} type="submit">
            {isSaving
              ? "Salvando…"
              : editingResource
                ? "Salvar alterações"
                : `Adicionar ${configuration.singularLabel}`}
          </button>
          {editingResource ? (
            <button className="admin-service-form__cancel" onClick={resetForm} type="button">Cancelar edição</button>
          ) : null}
        </div>
      </form>

      <div className="admin-table-wrap">
        {isLoading ? <p className="notice">Carregando {configuration.collectionLabel.toLowerCase()}…</p> : null}
        {!isLoading && !error && resources.length === 0 ? (
          <p className="notice">Nenhum {configuration.singularLabel} cadastrado.</p>
        ) : null}
        {!isLoading && !error && resources.length ? (
          <table className="admin-table admin-workshop-resources-table">
            <caption>{resources.length} {configuration.collectionLabel.toLowerCase()} cadastrados</caption>
            <thead>
              <tr>
                <th scope="col">{configuration.singularLabel}</th>
                <th scope="col">Status</th>
                <th scope="col">Ações</th>
              </tr>
            </thead>
            <tbody>
              {resources.map((resource) => {
                const resourceValue = workshopResourceValue(resource, configuration);
                return (
                  <tr key={resource.id}>
                    <td><strong>{resourceValue}</strong></td>
                    <td>
                      <strong className={`admin-service-status admin-service-status--${resource.is_active ? "active" : "inactive"}`}>
                        {resource.is_active ? "Ativo" : "Inativo"}
                      </strong>
                    </td>
                    <td>
                      <div className="admin-actions">
                        <button
                          aria-label={`Editar ${configuration.singularLabel} ${resourceValue}`}
                          className="admin-action admin-action--edit"
                          disabled={isSaving || resourceBeingDeactivated === resource.id}
                          onClick={() => editResource(resource)}
                          type="button"
                        >
                          Editar
                        </button>
                        {resource.is_active ? (
                          <button
                            aria-label={`Desativar ${configuration.singularLabel} ${resourceValue}`}
                            className="admin-action admin-action--deactivate"
                            disabled={isSaving || resourceBeingDeactivated === resource.id}
                            onClick={() => void deactivateResource(resource)}
                            type="button"
                          >
                            {resourceBeingDeactivated === resource.id ? "Desativando…" : "Desativar"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </div>
    </section>
  );
}

function AdministratorWorkshopResources({ accessToken, onLogout }: AdministratorPanelProps) {
  return (
    <section className="admin-workshop-resources" aria-labelledby="admin-workshop-resources-title">
      <div className="admin-workshop-resources__heading">
        <p className="eyebrow">CAPACIDADE DA OFICINA</p>
        <h2 id="admin-workshop-resources-title">Gerenciar recursos da oficina</h2>
        <p>Cadastre, atualize ou desative os boxes e funcionários usados nos atendimentos.</p>
      </div>
      <div className="admin-workshop-resources__grid">
        <AdministratorWorkshopResourceManager
          accessToken={accessToken}
          configuration={workshopBoxConfiguration}
          onLogout={onLogout}
        />
        <AdministratorWorkshopResourceManager
          accessToken={accessToken}
          configuration={employeeConfiguration}
          onLogout={onLogout}
        />
      </div>
    </section>
  );
}

type AdministratorSchedulingProps = AdministratorPanelProps & {
  request: AdministratorRequestSummary;
  onCancel: () => void;
  onScheduled: (confirmation: AdministratorSchedulingConfirmation) => void;
};

function AdministratorScheduling({
  accessToken,
  onCancel,
  onLogout,
  onScheduled,
  request,
}: AdministratorSchedulingProps) {
  const [suggestion, setSuggestion] = useState<AdministratorSchedulingSuggestion | null>(null);
  const [boxes, setBoxes] = useState<AdministratorWorkshopResource[]>([]);
  const [employees, setEmployees] = useState<AdministratorWorkshopResource[]>([]);
  const [workshopBoxId, setWorkshopBoxId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [scheduledStartAt, setScheduledStartAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadSchedulingData() {
      setIsLoading(true);
      setError(null);

      try {
        const [suggestionResponse, boxesResponse, employeesResponse] = await Promise.all([
          fetch(`${apiBaseUrl}/admin/requests/${request.id}/scheduling-suggestion`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
          fetch(`${apiBaseUrl}/admin/boxes`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
          fetch(`${apiBaseUrl}/admin/employees`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
        ]);
        if ([suggestionResponse, boxesResponse, employeesResponse].some((response) => response.status === 401)) {
          if (isMounted) {
            onLogout();
          }
          return;
        }
        if (!suggestionResponse.ok) {
          throw new Error("Não foi possível encontrar uma sugestão de horário para esta solicitação.");
        }
        if (!boxesResponse.ok || !employeesResponse.ok) {
          throw new Error("Não foi possível carregar os recursos ativos da oficina.");
        }

        const [loadedSuggestion, loadedBoxes, loadedEmployees] = await Promise.all([
          suggestionResponse.json() as Promise<AdministratorSchedulingSuggestion>,
          boxesResponse.json() as Promise<AdministratorWorkshopResource[]>,
          employeesResponse.json() as Promise<AdministratorWorkshopResource[]>,
        ]);
        if (isMounted) {
          setSuggestion(loadedSuggestion);
          setBoxes(loadedBoxes.filter((box) => box.is_active));
          setEmployees(loadedEmployees.filter((employee) => employee.is_active));
          setWorkshopBoxId(String(loadedSuggestion.workshop_box_id));
          setEmployeeId(String(loadedSuggestion.employee_id));
          setScheduledStartAt(toDatetimeLocalValue(loadedSuggestion.scheduled_start_at));
        }
      } catch (loadError) {
        if (isMounted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Não foi possível preparar o agendamento.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadSchedulingData();
    return () => {
      isMounted = false;
    };
  }, [accessToken, onLogout, request.id]);

  async function submitScheduling(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workshopBoxId || !employeeId || !scheduledStartAt) {
      setError("Escolha um box, um funcionário e o horário de início.");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(`${apiBaseUrl}/admin/requests/${request.id}/schedule`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workshop_box_id: Number(workshopBoxId),
          employee_id: Number(employeeId),
          scheduled_start_at: scheduledStartAt,
        }),
      });
      if (response.status === 401) {
        onLogout();
        return;
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(payload?.detail ?? "Não foi possível agendar a solicitação. Revise a disponibilidade e tente novamente.");
      }

      onScheduled((await response.json()) as AdministratorSchedulingConfirmation);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Não foi possível agendar a solicitação. Revise a disponibilidade e tente novamente.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="admin-scheduling" aria-labelledby="admin-scheduling-title">
      <div className="admin-scheduling__heading">
        <p className="eyebrow">CONFIRMAÇÃO COM CAPACIDADE</p>
        <h2 id="admin-scheduling-title">Agendar {request.name}</h2>
        <p>Use a sugestão ou ajuste os recursos e o horário antes de confirmar o atendimento.</p>
      </div>

      {isLoading ? <p className="notice">Buscando o melhor horário disponível…</p> : null}
      {error ? <p className="notice notice--error" role="alert">{error}</p> : null}
      {!isLoading && !error ? (
        <form className="admin-scheduling__form" onSubmit={submitScheduling}>
          {suggestion ? (
            <p className="admin-scheduling__suggestion">
              Sugestão: {suggestion.workshop_box_label} com {suggestion.employee_name} em {formatRequestDate(suggestion.scheduled_start_at)}.
            </p>
          ) : null}
          <label>
            Box do atendimento
            <select
              onChange={(event) => setWorkshopBoxId(event.target.value)}
              required
              value={workshopBoxId}
            >
              <option value="">Selecione um box</option>
              {boxes.map((box) => <option key={box.id} value={box.id}>{box.label}</option>)}
            </select>
          </label>
          <label>
            Funcionário responsável
            <select
              onChange={(event) => setEmployeeId(event.target.value)}
              required
              value={employeeId}
            >
              <option value="">Selecione um funcionário</option>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
            </select>
          </label>
          <label>
            Início do atendimento
            <input
              onChange={(event) => setScheduledStartAt(event.target.value)}
              required
              step="60"
              type="datetime-local"
              value={scheduledStartAt}
            />
          </label>
          <div className="admin-scheduling__actions">
            <button className="button" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Agendando…" : "Confirmar agendamento"}
            </button>
            <button className="admin-service-form__cancel" disabled={isSubmitting} onClick={onCancel} type="button">
              Fechar
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function AdministratorPanel({ accessToken, onLogout }: AdministratorPanelProps) {
  const [requestPage, setRequestPage] = useState<AdministratorRequestPage | null>(null);
  const [statusFilter, setStatusFilter] = useState<RequestStatus | "">("");
  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [page, setPage] = useState(1);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [isLoadingQueue, setIsLoadingQueue] = useState(true);
  const [queueRefresh, setQueueRefresh] = useState(0);
  const [requestStatusBeingUpdated, setRequestStatusBeingUpdated] = useState<{
    requestId: number;
    status: AdministratorRequestActionStatus;
  } | null>(null);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);
  const [requestBeingScheduled, setRequestBeingScheduled] = useState<AdministratorRequestSummary | null>(null);

  useEffect(() => {
    let isMounted = true;
    const query = new URLSearchParams({ page: String(page), page_size: "10" });
    if (statusFilter) {
      query.set("status", statusFilter);
    }
    if (activeSearch) {
      query.set("q", activeSearch);
    }

    async function loadRequestQueue() {
      setIsLoadingQueue(true);
      setQueueError(null);

      try {
        const response = await fetch(`${apiBaseUrl}/admin/requests?${query}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (response.status === 401) {
          if (isMounted) {
            onLogout();
          }
          return;
        }
        if (!response.ok) {
          throw new Error("Não foi possível carregar a fila de solicitações.");
        }

        const loadedPage = (await response.json()) as AdministratorRequestPage;
        if (isMounted) {
          setRequestPage(loadedPage);
        }
      } catch (error) {
        if (isMounted) {
          setQueueError(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar a fila de solicitações.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingQueue(false);
        }
      }
    }

    void loadRequestQueue();
    return () => {
      isMounted = false;
    };
  }, [accessToken, activeSearch, onLogout, page, queueRefresh, statusFilter]);

  function updateStatusFilter(nextStatus: RequestStatus | "") {
    setStatusFilter(nextStatus);
    setPage(1);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActiveSearch(searchInput.trim());
    setPage(1);
  }

  async function updateRequestStatus(
    request: AdministratorRequestSummary,
    nextStatus: AdministratorRequestActionStatus,
  ) {
    const action = { infinitive: "cancelar", pastParticiple: "cancelada" };
    setQueueError(null);
    setStatusFeedback(null);
    setRequestStatusBeingUpdated({ requestId: request.id, status: nextStatus });

    try {
      const response = await fetch(`${apiBaseUrl}/admin/requests/${request.id}/status`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (response.status === 401) {
        onLogout();
        return;
      }
      if (!response.ok) {
        throw new Error(`Não foi possível ${action.infinitive} a solicitação.`);
      }

      const updatedRequest = (await response.json()) as AdministratorRequestStatusResponse;
      if (updatedRequest.status !== nextStatus) {
        throw new Error(`Não foi possível ${action.infinitive} a solicitação.`);
      }

      setRequestPage((currentPage) => currentPage ? {
        ...currentPage,
        items: currentPage.items.map((currentRequest) => (
          currentRequest.id === updatedRequest.id
            ? { ...currentRequest, status: updatedRequest.status }
            : currentRequest
        )),
      } : currentPage);
      setStatusFeedback(`Solicitação de ${request.name} ${action.pastParticiple}.`);
      if (requestBeingScheduled?.id === request.id) {
        setRequestBeingScheduled(null);
      }
      setQueueRefresh((currentRefresh) => currentRefresh + 1);
    } catch (error) {
      setQueueError(
        error instanceof Error ? error.message : `Não foi possível ${action.infinitive} a solicitação.`,
      );
    } finally {
      setRequestStatusBeingUpdated(null);
    }
  }

  function applySchedulingConfirmation(confirmation: AdministratorSchedulingConfirmation) {
    const requestName = requestBeingScheduled?.name ?? "selecionada";
    setRequestPage((currentPage) => currentPage ? {
      ...currentPage,
      items: currentPage.items.map((currentRequest) => (
        currentRequest.id === confirmation.id
          ? {
            ...currentRequest,
            status: confirmation.status,
            operational_status: confirmation.operational_status,
            scheduled_start_at: confirmation.scheduled_start_at,
            scheduled_end_at: confirmation.scheduled_end_at,
            workshop_box_label: confirmation.workshop_box_label,
            employee_name: confirmation.employee_name,
          }
          : currentRequest
      )),
    } : currentPage);
    setRequestBeingScheduled(null);
    setStatusFeedback(`Solicitação de ${requestName} agendada.`);
    setQueueRefresh((currentRefresh) => currentRefresh + 1);
  }

  const totalPages = Math.max(requestPage?.total_pages ?? 1, 1);

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <a className="brand" href="/" aria-label="AutoSync - início">
          <span className="brand-mark" aria-hidden="true"><i /><i /></span>
          <span><strong>AutoSync</strong><small>PAINEL ADMINISTRATIVO</small></span>
        </a>
        <button className="admin-header__logout" onClick={onLogout} type="button">Sair</button>
      </header>
      <section className="admin-queue" aria-labelledby="admin-title">
        <p className="eyebrow">SESSÃO ATIVA</p>
        <h1 id="admin-title">Painel administrativo</h1>
        <p className="admin-queue__intro">
          Acompanhe as solicitações recebidas e encontre rapidamente quem precisa de retorno.
        </p>

        <div className="admin-toolbar">
          <label>
            Filtrar por status
            <select
              onChange={(event) => updateStatusFilter(event.target.value as RequestStatus | "")}
              value={statusFilter}
            >
              <option value="">Todos os status</option>
              <option value="PENDENTE">Pendente de confirmação</option>
              <option value="CONFIRMADO">Atendimento confirmado</option>
              <option value="CANCELADO">Solicitação cancelada</option>
            </select>
          </label>
          <form className="admin-toolbar__search" onSubmit={submitSearch}>
            <label>
              Buscar por nome ou e-mail
              <input
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Ex.: Ana Silva"
                value={searchInput}
              />
            </label>
            <button className="button" type="submit">Buscar</button>
          </form>
        </div>

        {queueError ? <p className="notice notice--error" role="alert">{queueError}</p> : null}
        {statusFeedback ? <p className="notice notice--success" role="status">{statusFeedback}</p> : null}
        {isLoadingQueue ? <p className="notice">Carregando solicitações…</p> : null}
        {!isLoadingQueue && !queueError && requestPage?.items.length === 0 ? (
          <p className="notice">Nenhuma solicitação encontrada.</p>
        ) : null}
        {!isLoadingQueue && !queueError && requestPage?.items.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <caption>{requestPage.total} solicitações encontradas</caption>
              <thead>
                <tr>
                  <th scope="col">Cliente</th>
                  <th scope="col">Serviço</th>
                  <th scope="col">Status</th>
                  <th scope="col">Agendamento</th>
                  <th scope="col">Recebido</th>
                  <th scope="col">Ações</th>
                </tr>
              </thead>
              <tbody>
                {requestPage.items.map((request) => (
                  <tr key={request.id}>
                    <td>
                      <strong>{request.name}</strong>
                      <span>{request.email ?? "Sem e-mail"}</span>
                    </td>
                    <td>{request.service_title}</td>
                    <td>
                      <strong className={`tracking-status tracking-status--${request.status.toLowerCase()}`}>
                        {displayStatus(request.status)}
                      </strong>
                      {request.operational_status ? (
                        <strong className={`admin-operational-status admin-operational-status--${request.operational_status.toLowerCase()}`}>
                          {displayOperationalStatus(request.operational_status)}
                        </strong>
                      ) : null}
                    </td>
                    <td>
                      {request.scheduled_start_at ? (
                        <span className="admin-schedule-summary">
                          {formatRequestDate(request.scheduled_start_at)}<br />
                          {request.workshop_box_label} · {request.employee_name}
                        </span>
                      ) : "A definir"}
                    </td>
                    <td>{formatRequestDate(request.created_at)}</td>
                    <td>
                      <div className="admin-actions">
                        {request.status === "PENDENTE" ? (
                          <button
                            aria-label={`Agendar solicitação de ${request.name}`}
                            className="admin-action admin-action--confirm"
                            disabled={requestStatusBeingUpdated?.requestId === request.id}
                            onClick={() => setRequestBeingScheduled(request)}
                            type="button"
                          >
                            Agendar
                          </button>
                        ) : null}
                        {request.status !== "CANCELADO" ? (
                          <button
                            aria-label={`Cancelar solicitação de ${request.name}`}
                            className="admin-action admin-action--cancel"
                            disabled={requestStatusBeingUpdated?.requestId === request.id}
                            onClick={() => void updateRequestStatus(request, "CANCELADO")}
                            type="button"
                          >
                            {requestStatusBeingUpdated?.requestId === request.id
                              && requestStatusBeingUpdated.status === "CANCELADO"
                              ? "Cancelando…"
                              : "Cancelar"}
                          </button>
                        ) : <span className="admin-action__empty">—</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {requestBeingScheduled ? (
          <AdministratorScheduling
            accessToken={accessToken}
            onCancel={() => setRequestBeingScheduled(null)}
            onLogout={onLogout}
            onScheduled={applySchedulingConfirmation}
            request={requestBeingScheduled}
          />
        ) : null}

        {!isLoadingQueue && !queueError && requestPage?.total ? (
          <nav className="admin-pagination" aria-label="Paginação das solicitações">
            <button disabled={page === 1} onClick={() => setPage(page - 1)} type="button">
              Página anterior
            </button>
            <span>Página {page} de {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} type="button">
              Próxima página
            </button>
          </nav>
        ) : null}

        <AdministratorServices accessToken={accessToken} onLogout={onLogout} />
        <AdministratorWorkshopResources accessToken={accessToken} onLogout={onLogout} />
      </section>
    </main>
  );
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
  const [currentPath, setCurrentPath] = useState<ApplicationPath>(currentApplicationPath);
  const [administratorSession, setAdministratorSession] = useState<AdministratorSession | null>(
    loadAdministratorSession,
  );

  function navigate(path: ApplicationPath, replace = false) {
    window.history[replace ? "replaceState" : "pushState"]({}, "", path);
    setCurrentPath(path);
  }

  function authenticateAdministrator(accessToken: string) {
    const nextSession = { accessToken };
    window.localStorage.setItem(administratorSessionStorageKey, JSON.stringify(nextSession));
    setAdministratorSession(nextSession);
    navigate("/admin");
  }

  function logoutAdministrator() {
    window.localStorage.removeItem(administratorSessionStorageKey);
    setAdministratorSession(null);
    navigate("/login");
  }

  useEffect(() => {
    const syncPathWithBrowser = () => setCurrentPath(currentApplicationPath());
    window.addEventListener("popstate", syncPathWithBrowser);
    return () => window.removeEventListener("popstate", syncPathWithBrowser);
  }, []);

  useEffect(() => {
    if (currentPath === "/admin" && !administratorSession) {
      navigate("/login", true);
    }
  }, [administratorSession, currentPath]);

  useEffect(() => {
    if (currentPath !== "/") {
      return;
    }

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
  }, [currentPath]);

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

  if (currentPath === "/login") {
    return (
      <LoginPage
        onAuthenticated={authenticateAdministrator}
        onNavigateHome={() => navigate("/")}
      />
    );
  }

  if (currentPath === "/admin") {
    if (!administratorSession) {
      return null;
    }
    return (
      <AdministratorPanel
        accessToken={administratorSession.accessToken}
        onLogout={logoutAdministrator}
      />
    );
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
          <a
            href={administratorSession ? "/admin" : "/login"}
            onClick={(event) => {
              event.preventDefault();
              navigate(administratorSession ? "/admin" : "/login");
            }}
          >
            Área do gestor
          </a>
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
