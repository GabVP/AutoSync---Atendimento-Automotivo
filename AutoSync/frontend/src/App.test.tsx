import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import App from "./App";

const fetchMock = vi.fn();
let anaRequestStatus = "PENDENTE";
let joaoRequestStatus = "CONFIRMADO";
let joaoOperationalStatus: "AGENDADO" | "EM_ANDAMENTO" | "ATRASADO" | "CONCLUÍDO" | null;
let shouldRejectJoaoStartAttempt: boolean;
let shouldRejectAnaSchedulingAttempt: boolean;
let shouldRejectAnaSchedulingLoad: boolean;
let joaoRequestSchedule: {
  scheduled_start_at: string;
  scheduled_end_at: string;
  workshop_box_label: string;
  employee_name: string;
} | null;
let anaRequestSchedule: {
  operational_status: "AGENDADO";
  scheduled_start_at: string;
  scheduled_end_at: string;
  workshop_box_label: string;
  employee_name: string;
} | null;
let administratorServices: Array<{
  id: number;
  title: string;
  duration_minutes: number;
  is_active: boolean;
}>;
let nextAdministratorServiceId: number;
type MockWorkshopResource = {
  id: number;
  label?: string;
  name?: string;
  is_active: boolean;
};
let administratorBoxes: MockWorkshopResource[];
let administratorEmployees: MockWorkshopResource[];
let nextAdministratorBoxId: number;
let nextAdministratorEmployeeId: number;

function workshopResourcesFor(kind: "boxes" | "employees"): MockWorkshopResource[] {
  return kind === "boxes" ? administratorBoxes : administratorEmployees;
}

function workshopResourceFieldFor(kind: "boxes" | "employees"): "label" | "name" {
  return kind === "boxes" ? "label" : "name";
}

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  window.localStorage.clear();
  anaRequestStatus = "PENDENTE";
  joaoRequestStatus = "CONFIRMADO";
  joaoOperationalStatus = "AGENDADO";
  shouldRejectJoaoStartAttempt = false;
  shouldRejectAnaSchedulingAttempt = false;
  shouldRejectAnaSchedulingLoad = false;
  joaoRequestSchedule = {
    scheduled_start_at: "2026-09-08T10:00:00",
    scheduled_end_at: "2026-09-08T10:45:00",
    workshop_box_label: "Box 1",
    employee_name: "Ana Martins",
  };
  anaRequestSchedule = null;
  administratorServices = [{
    id: 1,
    title: "Troca de óleo",
    duration_minutes: 45,
    is_active: true,
  }];
  nextAdministratorServiceId = 2;
  administratorBoxes = [{ id: 1, label: "Box 1", is_active: true }];
  administratorEmployees = [{ id: 1, name: "Ana Martins", is_active: true }];
  nextAdministratorBoxId = 2;
  nextAdministratorEmployeeId = 2;
  fetchMock.mockImplementation(async (input: string | URL, init?: RequestInit) => {
    const url = input.toString();
    const parsedUrl = new URL(url);
    if (parsedUrl.pathname.endsWith("/admin/services")) {
      if (init?.method === "POST") {
        expect(init.headers).toEqual({
          Authorization: "Bearer administrator-token",
          "Content-Type": "application/json",
        });
        const payload = JSON.parse(String(init.body)) as { title: string; duration_minutes: number };
        const createdService = {
          id: nextAdministratorServiceId,
          title: payload.title,
          duration_minutes: payload.duration_minutes,
          is_active: true,
        };
        nextAdministratorServiceId += 1;
        administratorServices.push(createdService);
        return new Response(JSON.stringify(createdService), { status: 201 });
      }

      expect(init?.headers).toEqual({ Authorization: "Bearer administrator-token" });
      return new Response(JSON.stringify(administratorServices), { status: 200 });
    }

    const serviceUpdateMatch = parsedUrl.pathname.match(/\/admin\/services\/(\d+)$/);
    if (serviceUpdateMatch) {
      expect(init?.method).toBe("PATCH");
      expect(init?.headers).toEqual({
        Authorization: "Bearer administrator-token",
        "Content-Type": "application/json",
      });
      const serviceId = Number(serviceUpdateMatch[1]);
      const payload = JSON.parse(String(init?.body)) as Partial<{
        title: string;
        duration_minutes: number;
        is_active: boolean;
      }>;
      const serviceIndex = administratorServices.findIndex((service) => service.id === serviceId);
      if (serviceIndex === -1) {
        return new Response(null, { status: 404 });
      }
      administratorServices[serviceIndex] = { ...administratorServices[serviceIndex], ...payload };
      return new Response(JSON.stringify(administratorServices[serviceIndex]), { status: 200 });
    }

    const workshopResourceListMatch = parsedUrl.pathname.match(/\/admin\/(boxes|employees)$/);
    if (workshopResourceListMatch) {
      const kind = workshopResourceListMatch[1] as "boxes" | "employees";
      const resources = workshopResourcesFor(kind);
      const field = workshopResourceFieldFor(kind);
      if (init?.method === "POST") {
        expect(init.headers).toEqual({
          Authorization: "Bearer administrator-token",
          "Content-Type": "application/json",
        });
        const payload = JSON.parse(String(init.body)) as Record<typeof field, string>;
        const createdResource: MockWorkshopResource = {
          id: kind === "boxes" ? nextAdministratorBoxId : nextAdministratorEmployeeId,
          [field]: payload[field],
          is_active: true,
        };
        if (kind === "boxes") {
          nextAdministratorBoxId += 1;
        } else {
          nextAdministratorEmployeeId += 1;
        }
        resources.push(createdResource);
        return new Response(JSON.stringify(createdResource), { status: 201 });
      }

      expect(init?.headers).toEqual({ Authorization: "Bearer administrator-token" });
      return new Response(JSON.stringify(resources), { status: 200 });
    }

    const workshopResourceUpdateMatch = parsedUrl.pathname.match(/\/admin\/(boxes|employees)\/(\d+)$/);
    if (workshopResourceUpdateMatch) {
      expect(init?.method).toBe("PATCH");
      expect(init?.headers).toEqual({
        Authorization: "Bearer administrator-token",
        "Content-Type": "application/json",
      });
      const kind = workshopResourceUpdateMatch[1] as "boxes" | "employees";
      const resourceId = Number(workshopResourceUpdateMatch[2]);
      const resources = workshopResourcesFor(kind);
      const payload = JSON.parse(String(init?.body)) as Partial<MockWorkshopResource>;
      const resourceIndex = resources.findIndex((resource) => resource.id === resourceId);
      if (resourceIndex === -1) {
        return new Response(null, { status: 404 });
      }
      resources[resourceIndex] = { ...resources[resourceIndex], ...payload };
      return new Response(JSON.stringify(resources[resourceIndex]), { status: 200 });
    }

    if (parsedUrl.pathname.endsWith("/services")) {
      return new Response(
        JSON.stringify(
          administratorServices
            .filter((service) => service.is_active)
            .map(({ is_active: _isActive, ...service }) => service),
        ),
        { status: 200 },
      );
    }

    if (parsedUrl.pathname.endsWith("/admin/requests")) {
      expect(init?.headers).toEqual({ Authorization: "Bearer administrator-token" });
      const status = parsedUrl.searchParams.get("status");
      const search = parsedUrl.searchParams.get("q");
      const page = parsedUrl.searchParams.get("page");
      const joaoRequest = {
        id: 3,
        name: "João Souza",
        email: null,
        phone: "11987654323",
        service_title: "Diagnóstico eletrônico",
        status: joaoRequestStatus,
        tracking_code: "ATS-00000003",
        created_at: "2026-09-03T10:00:00",
        operational_status: joaoOperationalStatus,
        scheduled_start_at: joaoRequestSchedule?.scheduled_start_at ?? null,
        scheduled_end_at: joaoRequestSchedule?.scheduled_end_at ?? null,
        workshop_box_label: joaoRequestSchedule?.workshop_box_label ?? null,
        employee_name: joaoRequestSchedule?.employee_name ?? null,
      };

      if (status === "CONFIRMADO" || search === "João") {
        return new Response(
          JSON.stringify({ items: [joaoRequest], page: 1, page_size: 10, total: 1, total_pages: 1 }),
          { status: 200 },
        );
      }

      if (page === "2") {
        return new Response(
          JSON.stringify({
            items: [{
              id: 2,
              name: "Bruna Lima",
              email: "bruna@example.com",
              phone: "11987654322",
              service_title: "Revisão preventiva",
              status: "PENDENTE",
              tracking_code: "ATS-00000002",
              created_at: "2026-09-02T10:00:00",
              operational_status: null,
              scheduled_start_at: null,
              scheduled_end_at: null,
              workshop_box_label: null,
              employee_name: null,
            }],
            page: 2,
            page_size: 10,
            total: 11,
            total_pages: 2,
          }),
          { status: 200 },
        );
      }

      return new Response(
        JSON.stringify({
          items: [{
            id: 1,
            name: "Ana Silva",
            email: "ana@example.com",
            phone: "11987654321",
            service_title: "Troca de óleo",
            status: anaRequestStatus,
            tracking_code: "ATS-00000001",
            created_at: "2026-09-01T10:00:00",
            operational_status: anaRequestSchedule?.operational_status ?? null,
            scheduled_start_at: anaRequestSchedule?.scheduled_start_at ?? null,
            scheduled_end_at: anaRequestSchedule?.scheduled_end_at ?? null,
            workshop_box_label: anaRequestSchedule?.workshop_box_label ?? null,
            employee_name: anaRequestSchedule?.employee_name ?? null,
          }],
          page: 1,
          page_size: 10,
          total: 11,
          total_pages: 2,
        }),
        { status: 200 },
      );
    }

    const schedulingSuggestionMatch = parsedUrl.pathname.match(/\/admin\/requests\/(\d+)\/scheduling-suggestion$/);
    if (schedulingSuggestionMatch) {
      expect(init?.headers).toEqual({ Authorization: "Bearer administrator-token" });
      const requestId = Number(schedulingSuggestionMatch[1]);
      expect([1, 3]).toContain(requestId);
      if (requestId === 1 && shouldRejectAnaSchedulingLoad) {
        shouldRejectAnaSchedulingLoad = false;
        return new Response(null, { status: 503 });
      }
      const scheduledStartAt = requestId === 3 ? "2026-09-08T10:45:00" : "2026-09-08T08:00:00";
      const scheduledEndAt = requestId === 3 ? "2026-09-08T11:30:00" : "2026-09-08T08:45:00";
      return new Response(
        JSON.stringify({
          request_id: requestId,
          workshop_box_id: 1,
          workshop_box_label: "Box 1",
          employee_id: 1,
          employee_name: "Ana Martins",
          scheduled_start_at: scheduledStartAt,
          scheduled_end_at: scheduledEndAt,
        }),
        { status: 200 },
      );
    }

    const schedulingConfirmationMatch = parsedUrl.pathname.match(/\/admin\/requests\/(\d+)\/schedule$/);
    if (schedulingConfirmationMatch) {
      const requestId = Number(schedulingConfirmationMatch[1]);
      const isRescheduling = requestId === 3;
      expect(init?.method).toBe(isRescheduling ? "PATCH" : "POST");
      expect(init?.headers).toEqual({
        Authorization: "Bearer administrator-token",
        "Content-Type": "application/json",
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        workshop_box_id: 1,
        employee_id: 1,
        scheduled_start_at: isRescheduling ? "2026-09-08T10:45" : "2026-09-08T08:00",
      });
      if (!isRescheduling && shouldRejectAnaSchedulingAttempt) {
        shouldRejectAnaSchedulingAttempt = false;
        return new Response(
          JSON.stringify({
            detail: "O horário escolhido não está mais disponível. Escolha outro horário e tente novamente.",
          }),
          { status: 409 },
        );
      }
      if (isRescheduling) {
        joaoRequestSchedule = {
          scheduled_start_at: "2026-09-08T10:45:00",
          scheduled_end_at: "2026-09-08T11:30:00",
          workshop_box_label: "Box 1",
          employee_name: "Ana Martins",
        };
        return new Response(
          JSON.stringify({
            id: requestId,
            status: "CONFIRMADO",
            operational_status: "AGENDADO",
            workshop_box_id: 1,
            employee_id: 1,
            ...joaoRequestSchedule,
          }),
          { status: 200 },
        );
      }
      anaRequestStatus = "CONFIRMADO";
      anaRequestSchedule = {
        operational_status: "AGENDADO",
        scheduled_start_at: "2026-09-08T08:00:00",
        scheduled_end_at: "2026-09-08T08:45:00",
        workshop_box_label: "Box 1",
        employee_name: "Ana Martins",
      };
      return new Response(
        JSON.stringify({ id: 1, status: anaRequestStatus, ...anaRequestSchedule, workshop_box_id: 1, employee_id: 1 }),
        { status: 200 },
      );
    }

    const operationalStatusUpdateMatch = parsedUrl.pathname.match(/\/admin\/requests\/(\d+)\/operational-status$/);
    if (operationalStatusUpdateMatch) {
      expect(init?.method).toBe("PATCH");
      expect(init?.headers).toEqual({
        Authorization: "Bearer administrator-token",
        "Content-Type": "application/json",
      });
      expect(Number(operationalStatusUpdateMatch[1])).toBe(3);
      const payload = JSON.parse(String(init?.body)) as { operational_status: typeof joaoOperationalStatus };
      expect(["EM_ANDAMENTO", "CONCLUÍDO"]).toContain(payload.operational_status);
      if (payload.operational_status === "EM_ANDAMENTO" && shouldRejectJoaoStartAttempt) {
        shouldRejectJoaoStartAttempt = false;
        return new Response(
          JSON.stringify({
            detail: "O atendimento só pode ser iniciado a partir de 08/09/2026 às 10:00.",
          }),
          { status: 409 },
        );
      }
      joaoOperationalStatus = payload.operational_status;
      return new Response(
        JSON.stringify({ id: 3, status: "CONFIRMADO", operational_status: joaoOperationalStatus }),
        { status: 200 },
      );
    }

    const statusUpdateMatch = parsedUrl.pathname.match(/\/admin\/requests\/(\d+)\/status$/);
    if (statusUpdateMatch) {
      expect(init?.method).toBe("PATCH");
      expect(init?.headers).toEqual({
        Authorization: "Bearer administrator-token",
        "Content-Type": "application/json",
      });
      const status = JSON.parse(String(init?.body)) as { status: string };
      expect(["CONFIRMADO", "CANCELADO"]).toContain(status.status);
      const requestId = Number(statusUpdateMatch[1]);
      if (requestId === 1) {
        anaRequestStatus = status.status;
      } else if (requestId === 3) {
        joaoRequestStatus = status.status;
        if (status.status === "CANCELADO") {
          joaoOperationalStatus = null;
          joaoRequestSchedule = null;
        }
      } else {
        throw new Error(`Unexpected request status update for ${requestId}.`);
      }
      return new Response(JSON.stringify({ id: requestId, status: status.status }), { status: 200 });
    }

    if (url.endsWith("/requests")) {
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toMatchObject({
        name: "Ana Silva",
        service_id: 1,
      });
      return new Response(
        JSON.stringify({
          id: 1,
          status: "PENDENTE",
          tracking_code: "ATS-AB12CD34",
          service_title: "Troca de óleo",
          created_at: "2026-09-06T00:00:00",
        }),
        { status: 201 },
      );
    }

    if (url.endsWith("/requests/ATS-AB12CD34")) {
      return new Response(
        JSON.stringify({
          tracking_code: "ATS-AB12CD34",
          status: "CONFIRMADO",
          service_title: "Troca de óleo",
          vehicle_make: "Honda",
          vehicle_model: "Fit",
          created_at: "2026-09-06T00:00:00",
          updated_at: "2026-09-06T00:00:00",
        }),
        { status: 200 },
      );
    }

    if (url.endsWith("/requests/ATS-FFFFFFFF")) {
      return new Response(JSON.stringify({ detail: "Not found" }), { status: 404 });
    }

    if (url.endsWith("/auth/login")) {
      expect(init?.method).toBe("POST");
      const credentials = JSON.parse(String(init?.body)) as { email: string; password: string };
      if (credentials.email === "admin@autosync.example.com" && credentials.password === "autosync-demo") {
        return new Response(
          JSON.stringify({ access_token: "administrator-token", token_type: "bearer", expires_in: 3600 }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ detail: "Invalid credentials" }), { status: 401 });
    }

    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

test("visitor can submit a valid request and see its tracking code", async () => {
  const user = userEvent.setup();
  render(<App />);

  await screen.findByRole("option", { name: "Troca de óleo" });
  await user.type(screen.getByLabelText(/^Nome/), "Ana Silva");
  await user.type(screen.getByLabelText(/^Telefone/), "11987654321");
  await user.type(screen.getByLabelText(/^Marca/), "Honda");
  await user.type(screen.getByLabelText(/^Modelo/), "Fit");
  await user.type(screen.getByLabelText(/^Placa/), "ABC1D23");
  await user.selectOptions(screen.getByLabelText(/^Serviço/), "1");
  await user.type(screen.getByLabelText(/^Descrição/), "Troca de óleo e filtro");
  await user.click(screen.getByLabelText(/Concordo com os Termos de Uso/));
  await user.click(screen.getByRole("button", { name: /Enviar solicitação/ }));

  expect(await screen.findByText("ATS-AB12CD34")).toBeInTheDocument();
  expect(screen.getByText("Pedido recebido como PENDENTE.")).toBeInTheDocument();
});

test("visitor interface keeps management access private and required markers with their labels", async () => {
  render(<App />);

  await screen.findByRole("option", { name: "Troca de óleo" });

  expect(screen.queryByRole("link", { name: "Área do gestor" })).not.toBeInTheDocument();
  const nameFieldLabel = screen.getByText(/^Nome/, { selector: ".field-label" });
  expect(nameFieldLabel.querySelector("em")).toHaveTextContent("*");
});

test("visitor interface renders the supplied workshop visual assets", async () => {
  render(<App />);

  await screen.findByRole("option", { name: "Troca de óleo" });

  const heroImage = screen.getByRole("img", { name: "Mecânicos trabalhando na oficina AutoSync" });
  expect(heroImage)
    .toHaveAttribute("src", "/assets/images/hero/workshop-hero.webp");
  expect(heroImage).toHaveClass("hero__image");
  expect(document.querySelector(".brand-logo"))
    .toHaveAttribute("src", "/assets/brand/autosync-logo.png");
  const serviceImage = document.querySelector(".service-card__art img");
  expect(serviceImage)
    .toHaveAttribute("src", "/assets/images/services/oil-change.webp");
  expect(serviceImage).toHaveClass("service-card__image");
  expect(serviceImage?.closest(".service-card")).toHaveClass("service-card--media-first");
  const benefitIconSources = Array.from(document.querySelectorAll(".benefit-icon"))
    .map((icon) => icon.getAttribute("src"));
  expect(benefitIconSources).toEqual([
    "/assets/icons/benefits/specialist.png",
    "/assets/icons/benefits/quick-response.png",
    "/assets/icons/benefits/vehicle-care.png",
  ]);
});

test("visitor sees browser validation and no request is sent with missing fields", async () => {
  const user = userEvent.setup();
  render(<App />);

  await screen.findByRole("option", { name: "Troca de óleo" });
  await user.click(screen.getByRole("button", { name: /Enviar solicitação/ }));

  expect(await screen.findByText("Informe seu nome.")).toBeInTheDocument();
  expect(screen.getByText("Selecione um serviço.")).toBeInTheDocument();
  expect(screen.getByText("Você precisa aceitar os termos para enviar a solicitação.")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("visitor can track a request with the received code", async () => {
  const user = userEvent.setup();
  render(<App />);

  await screen.findByRole("option", { name: "Troca de óleo" });
  await user.type(screen.getByLabelText("Código de acompanhamento"), "ats-ab12cd34");
  await user.click(screen.getByRole("button", { name: "Acompanhar solicitação" }));

  expect(await screen.findByText("Atendimento confirmado")).toBeInTheDocument();
  expect(screen.getByText("Honda Fit")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenLastCalledWith(
    "http://localhost:8000/api/v1/requests/ATS-AB12CD34",
  );
});

test("visitor receives generic feedback when the tracking code is unknown", async () => {
  const user = userEvent.setup();
  render(<App />);

  await screen.findByRole("option", { name: "Troca de óleo" });
  await user.type(screen.getByLabelText("Código de acompanhamento"), "ATS-FFFFFFFF");
  await user.click(screen.getByRole("button", { name: "Acompanhar solicitação" }));

  expect(
    await screen.findByText("Não encontramos uma solicitação com esse código. Confira e tente novamente."),
  ).toBeInTheDocument();
});

test("visitor receives feedback before a malformed tracking code is sent", async () => {
  const user = userEvent.setup();
  render(<App />);

  await screen.findByRole("option", { name: "Troca de óleo" });
  await user.type(screen.getByLabelText("Código de acompanhamento"), "pedido-1");
  await user.click(screen.getByRole("button", { name: "Acompanhar solicitação" }));

  expect(
    await screen.findByText("Use o código no formato ATS-XXXXXXXX para acompanhar sua solicitação."),
  ).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("unauthenticated access to the administrative route redirects to login", async () => {
  window.history.replaceState({}, "", "/admin");
  render(<App />);

  expect(await screen.findByRole("heading", { name: "Acesso do gestor" })).toBeInTheDocument();
  await waitFor(() => expect(window.location.pathname).toBe("/login"));
  expect(screen.queryByRole("heading", { name: "Painel administrativo" })).not.toBeInTheDocument();
});

test("administrator can log in, access the protected panel, and log out", async () => {
  const user = userEvent.setup();
  window.history.replaceState({}, "", "/login");
  render(<App />);

  await user.type(screen.getByLabelText("E-mail"), "admin@autosync.example.com");
  await user.type(screen.getByLabelText("Senha"), "autosync-demo");
  await user.click(screen.getByRole("button", { name: "Entrar" }));

  expect(await screen.findByRole("heading", { name: "Painel administrativo" })).toBeInTheDocument();
  expect(window.localStorage.getItem("autosync.administrator-session")).toContain("administrator-token");
  expect(window.location.pathname).toBe("/admin");

  await user.click(screen.getByRole("button", { name: "Sair" }));

  expect(await screen.findByRole("heading", { name: "Acesso do gestor" })).toBeInTheDocument();
  expect(window.localStorage.getItem("autosync.administrator-session")).toBeNull();
  expect(window.location.pathname).toBe("/login");
});

test("administrator can move through the paginated request queue", async () => {
  const user = userEvent.setup();
  window.history.replaceState({}, "", "/admin");
  window.localStorage.setItem(
    "autosync.administrator-session",
    JSON.stringify({ accessToken: "administrator-token" }),
  );
  render(<App />);

  expect(await screen.findByText("Ana Silva")).toBeInTheDocument();
  expect(screen.getByText("Página 1 de 2")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Próxima página" }));

  expect(await screen.findByText("Bruna Lima")).toBeInTheDocument();
  expect(screen.getByText("Página 2 de 2")).toBeInTheDocument();
  await waitFor(() => {
    const requestUrl = new URL(String(fetchMock.mock.calls.at(-1)?.[0]));
    expect(requestUrl.searchParams.get("page")).toBe("2");
    expect(requestUrl.searchParams.get("page_size")).toBe("10");
  });
});

test("administrator can schedule a pending request from the suggestion while reviewing manual choices", async () => {
  const user = userEvent.setup();
  window.history.replaceState({}, "", "/admin");
  window.localStorage.setItem(
    "autosync.administrator-session",
    JSON.stringify({ accessToken: "administrator-token" }),
  );
  render(<App />);

  await screen.findByText("Ana Silva");
  await user.click(screen.getByRole("button", { name: "Agendar solicitação de Ana Silva" }));

  expect(await screen.findByText("Sugestão: Box 1 com Ana Martins em 08/09/2026, 08:00."))
    .toBeInTheDocument();
  expect(screen.getByLabelText("Box do atendimento")).toHaveValue("1");
  expect(screen.getByLabelText("Funcionário responsável")).toHaveValue("1");
  expect(screen.getByLabelText("Início do atendimento")).toHaveValue("2026-09-08T08:00");
  await user.click(screen.getByRole("button", { name: "Confirmar agendamento" }));

  expect(await screen.findByRole("status")).toHaveTextContent("Solicitação de Ana Silva agendada.");
  expect(await screen.findByText("Atendimento confirmado", { selector: "strong" })).toBeInTheDocument();
  expect(await screen.findByText("Agendado")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Agendar solicitação de Ana Silva" })).not.toBeInTheDocument();
});

test("administrator can retry loading a scheduling form after an error", async () => {
  const user = userEvent.setup();
  window.history.replaceState({}, "", "/admin");
  window.localStorage.setItem(
    "autosync.administrator-session",
    JSON.stringify({ accessToken: "administrator-token" }),
  );
  shouldRejectAnaSchedulingLoad = true;
  render(<App />);

  await screen.findByText("Ana Silva");
  await user.click(screen.getByRole("button", { name: "Agendar solicitação de Ana Silva" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Não foi possível encontrar uma sugestão de horário para esta solicitação.",
  );
  await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(await screen.findByText("Sugestão: Box 1 com Ana Martins em 08/09/2026, 08:00.")).toBeInTheDocument();
});

test("administrator can retry scheduling after an error without losing the form", async () => {
  const user = userEvent.setup();
  window.history.replaceState({}, "", "/admin");
  window.localStorage.setItem(
    "autosync.administrator-session",
    JSON.stringify({ accessToken: "administrator-token" }),
  );
  shouldRejectAnaSchedulingAttempt = true;
  render(<App />);

  await screen.findByText("Ana Silva");
  await user.click(screen.getByRole("button", { name: "Agendar solicitação de Ana Silva" }));
  expect(await screen.findByText("Sugestão: Box 1 com Ana Martins em 08/09/2026, 08:00.")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Confirmar agendamento" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "O horário escolhido não está mais disponível. Escolha outro horário e tente novamente.",
  );
  expect(screen.getByLabelText("Início do atendimento")).toHaveValue("2026-09-08T08:00");
  expect(screen.getByRole("button", { name: "Confirmar agendamento" })).toBeEnabled();

  await user.click(screen.getByRole("button", { name: "Confirmar agendamento" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Solicitação de Ana Silva agendada.");
});

test("administrator can start and conclude a scheduled attendance", async () => {
  const user = userEvent.setup();
  window.history.replaceState({}, "", "/admin");
  window.localStorage.setItem(
    "autosync.administrator-session",
    JSON.stringify({ accessToken: "administrator-token" }),
  );
  render(<App />);

  await screen.findByText("Ana Silva");
  await user.type(screen.getByLabelText("Buscar por nome ou e-mail"), "João");
  await user.click(screen.getByRole("button", { name: "Buscar" }));
  expect(await screen.findByText("João Souza")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Iniciar atendimento de João Souza" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Atendimento de João Souza iniciado.");
  expect(await screen.findByText("Em andamento")).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "Concluir atendimento de João Souza" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Concluir atendimento de João Souza" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Atendimento de João Souza concluído.");
  expect(await screen.findByText("Concluído")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Concluir atendimento de João Souza" })).not.toBeInTheDocument();
});

test("administrator can retry an attendance start after a premature-start error", async () => {
  const user = userEvent.setup();
  window.history.replaceState({}, "", "/admin");
  window.localStorage.setItem(
    "autosync.administrator-session",
    JSON.stringify({ accessToken: "administrator-token" }),
  );
  shouldRejectJoaoStartAttempt = true;
  render(<App />);

  await screen.findByText("Ana Silva");
  await user.type(screen.getByLabelText("Buscar por nome ou e-mail"), "João");
  await user.click(screen.getByRole("button", { name: "Buscar" }));
  expect(await screen.findByText("João Souza")).toBeInTheDocument();

  const startButton = screen.getByRole("button", { name: "Iniciar atendimento de João Souza" });
  await user.click(startButton);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "O atendimento só pode ser iniciado a partir de 08/09/2026 às 10:00.",
  );
  expect(screen.getByRole("button", { name: "Iniciar atendimento de João Souza" })).toBeEnabled();

  await user.click(screen.getByRole("button", { name: "Iniciar atendimento de João Souza" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Atendimento de João Souza iniciado.");
});

test("administrator can reschedule a scheduled attendance", async () => {
  const user = userEvent.setup();
  window.history.replaceState({}, "", "/admin");
  window.localStorage.setItem(
    "autosync.administrator-session",
    JSON.stringify({ accessToken: "administrator-token" }),
  );
  render(<App />);

  await screen.findByText("Ana Silva");
  await user.type(screen.getByLabelText("Buscar por nome ou e-mail"), "João");
  await user.click(screen.getByRole("button", { name: "Buscar" }));
  expect(await screen.findByText("João Souza")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Reagendar atendimento de João Souza" }));

  expect(await screen.findByRole("heading", { name: "Reagendar João Souza" })).toBeInTheDocument();
  expect(await screen.findByText("Sugestão: Box 1 com Ana Martins em 08/09/2026, 10:45.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Confirmar reagendamento" }));

  expect(await screen.findByRole("status")).toHaveTextContent("Atendimento de João Souza reagendado.");
  expect(await screen.findByText(/08\/09\/2026, 10:45/, { selector: ".admin-schedule-summary" })).toBeInTheDocument();
});

test("administrator can cancel pending and confirmed requests with refreshed feedback", async () => {
  const user = userEvent.setup();
  window.history.replaceState({}, "", "/admin");
  window.localStorage.setItem(
    "autosync.administrator-session",
    JSON.stringify({ accessToken: "administrator-token" }),
  );
  render(<App />);

  await screen.findByText("Ana Silva");
  await user.click(screen.getByRole("button", { name: "Cancelar solicitação de Ana Silva" }));

  await waitFor(() => {
    expect(screen.getByRole("status")).toHaveTextContent("Solicitação de Ana Silva cancelada.");
  });
  expect(await screen.findByText("Solicitação cancelada", { selector: "strong" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Cancelar solicitação de Ana Silva" })).not.toBeInTheDocument();

  await user.type(screen.getByLabelText("Buscar por nome ou e-mail"), "João");
  await user.click(screen.getByRole("button", { name: "Buscar" }));
  expect(await screen.findByText("João Souza")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Cancelar solicitação de João Souza" }));

  await waitFor(() => {
    expect(screen.getByRole("status")).toHaveTextContent("Solicitação de João Souza cancelada.");
  });
  expect(await screen.findByText("Solicitação cancelada", { selector: "strong" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Cancelar solicitação de João Souza" })).not.toBeInTheDocument();
  expect(screen.queryByText("Agendado", { selector: "strong" })).not.toBeInTheDocument();
  expect(screen.queryByText(/08\/09\/2026, 10:00/, { selector: ".admin-schedule-summary" })).not.toBeInTheDocument();
  expect(screen.getByText("A definir")).toBeInTheDocument();
});

test("administrator can filter the queue and find a request without email by name", async () => {
  const user = userEvent.setup();
  window.history.replaceState({}, "", "/admin");
  window.localStorage.setItem(
    "autosync.administrator-session",
    JSON.stringify({ accessToken: "administrator-token" }),
  );
  render(<App />);

  await screen.findByText("Ana Silva");
  await user.selectOptions(screen.getByLabelText("Filtrar por status"), "CONFIRMADO");
  expect(await screen.findByText("João Souza")).toBeInTheDocument();
  expect(screen.getByText("Sem e-mail")).toBeInTheDocument();

  await user.type(screen.getByLabelText("Buscar por nome ou e-mail"), "João");
  await user.click(screen.getByRole("button", { name: "Buscar" }));

  await waitFor(() => {
    const requestUrl = new URL(String(fetchMock.mock.calls.at(-1)?.[0]));
    expect(requestUrl.searchParams.get("status")).toBe("CONFIRMADO");
    expect(requestUrl.searchParams.get("q")).toBe("João");
  });
});

test("administrator can create, edit, and deactivate a service", async () => {
  const user = userEvent.setup();
  window.history.replaceState({}, "", "/admin");
  window.localStorage.setItem(
    "autosync.administrator-session",
    JSON.stringify({ accessToken: "administrator-token" }),
  );
  render(<App />);

  expect(await screen.findByRole("heading", { name: "Gerenciar serviços" })).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "Editar serviço Troca de óleo" })).toBeInTheDocument();

  await user.type(screen.getByLabelText("Nome do serviço"), "Revisão completa");
  await user.type(screen.getByLabelText("Duração estimada (minutos)"), "90");
  await user.click(screen.getByRole("button", { name: "Adicionar serviço" }));

  expect(await screen.findByRole("status")).toHaveTextContent("Serviço Revisão completa criado.");
  expect(await screen.findByText("Revisão completa")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Editar serviço Revisão completa" }));
  await user.clear(screen.getByLabelText("Nome do serviço"));
  await user.type(screen.getByLabelText("Nome do serviço"), "Revisão premium");
  await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

  expect(await screen.findByRole("status")).toHaveTextContent("Serviço Revisão premium atualizado.");
  expect(await screen.findByText("Revisão premium")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Desativar serviço Revisão premium" }));

  expect(await screen.findByRole("status")).toHaveTextContent("Serviço Revisão premium desativado.");
  expect(await screen.findByText("Inativo")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Desativar serviço Revisão premium" })).not.toBeInTheDocument();
});

test("administrator can create, edit, and deactivate boxes and employees", async () => {
  const user = userEvent.setup();
  window.history.replaceState({}, "", "/admin");
  window.localStorage.setItem(
    "autosync.administrator-session",
    JSON.stringify({ accessToken: "administrator-token" }),
  );
  render(<App />);

  expect(await screen.findByRole("heading", { name: "Gerenciar recursos da oficina" })).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "Editar box Box 1" })).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "Editar funcionário Ana Martins" })).toBeInTheDocument();

  await user.type(screen.getByLabelText("Identificação do box"), "Box de alinhamento");
  await user.click(screen.getByRole("button", { name: "Adicionar box" }));
  expect(await screen.findByText("Box de alinhamento criado.")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Editar box Box de alinhamento" }));
  await user.clear(screen.getByLabelText("Identificação do box"));
  await user.type(screen.getByLabelText("Identificação do box"), "Box de diagnósticos");
  await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
  expect(await screen.findByText("Box de diagnósticos atualizado.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Desativar box Box de diagnósticos" }));
  expect(await screen.findByText("Box de diagnósticos desativado.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Desativar box Box de diagnósticos" })).not.toBeInTheDocument();

  await user.type(screen.getByLabelText("Nome do funcionário"), "Bruno Lima");
  await user.click(screen.getByRole("button", { name: "Adicionar funcionário" }));
  expect(await screen.findByText("Funcionário Bruno Lima criado.")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Editar funcionário Bruno Lima" }));
  await user.clear(screen.getByLabelText("Nome do funcionário"));
  await user.type(screen.getByLabelText("Nome do funcionário"), "Bruno Costa");
  await user.click(screen.getAllByRole("button", { name: "Salvar alterações" })[0]);
  expect(await screen.findByText("Funcionário Bruno Costa atualizado.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Desativar funcionário Bruno Costa" }));
  expect(await screen.findByText("Funcionário Bruno Costa desativado.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Desativar funcionário Bruno Costa" })).not.toBeInTheDocument();
});
