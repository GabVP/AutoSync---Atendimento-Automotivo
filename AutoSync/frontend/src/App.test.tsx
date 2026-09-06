import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import App from "./App";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockImplementation(async (input: string | URL, init?: RequestInit) => {
    const url = input.toString();
    if (url.endsWith("/services")) {
      return new Response(
        JSON.stringify([{ id: 1, title: "Troca de óleo", duration_minutes: 45 }]),
        { status: 200 },
      );
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
