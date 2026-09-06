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
