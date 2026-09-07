import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import App from "./App";

const fetchMock = vi.fn();
let anaRequestStatus = "PENDENTE";
let joaoRequestStatus = "CONFIRMADO";
let administratorServices: Array<{
  id: number;
  title: string;
  duration_minutes: number;
  is_active: boolean;
}>;
let nextAdministratorServiceId: number;

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  window.localStorage.clear();
  anaRequestStatus = "PENDENTE";
  joaoRequestStatus = "CONFIRMADO";
  administratorServices = [{
    id: 1,
    title: "Troca de óleo",
    duration_minutes: 45,
    is_active: true,
  }];
  nextAdministratorServiceId = 2;
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
          }],
          page: 1,
          page_size: 10,
          total: 11,
          total_pages: 2,
        }),
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

test("administrator can confirm a pending request and see refreshed feedback", async () => {
  const user = userEvent.setup();
  window.history.replaceState({}, "", "/admin");
  window.localStorage.setItem(
    "autosync.administrator-session",
    JSON.stringify({ accessToken: "administrator-token" }),
  );
  render(<App />);

  await screen.findByText("Ana Silva");
  await user.click(screen.getByRole("button", { name: "Confirmar solicitação de Ana Silva" }));

  expect(await screen.findByRole("status")).toHaveTextContent("Solicitação de Ana Silva confirmada.");
  expect(await screen.findByText("Atendimento confirmado", { selector: "strong" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Confirmar solicitação de Ana Silva" })).not.toBeInTheDocument();
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
