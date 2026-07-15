import type {
  CloseTillRequest,
  CreateHandoverRequest,
  CurrencyDenomination,
  OpenTillRequest,
  TillHandover,
  TillReportSummary,
  TillSession,
} from "@repo/types";
import { api } from "./api";

export async function fetchCurrentTillSession(
  token: string,
): Promise<TillSession | null> {
  const data = await api.get<{ session: TillSession | null }>("/till/current", token);
  return data.session;
}

export async function fetchDenominations(
  token: string,
): Promise<CurrencyDenomination[]> {
  const data = await api.get<{ denominations: CurrencyDenomination[] }>(
    "/till/denominations",
    token,
  );
  return data.denominations;
}

export async function openTill(
  token: string,
  request: OpenTillRequest,
): Promise<TillSession> {
  const data = await api.post<{ session: TillSession }>("/till/open", request, token);
  return data.session;
}

export async function closeTill(
  token: string,
  request: CloseTillRequest,
): Promise<TillSession> {
  const data = await api.post<{ session: TillSession }>("/till/close", request, token);
  return data.session;
}

export async function fetchHandoverCandidates(
  token: string,
): Promise<TillSession[]> {
  const data = await api.get<{ sessions: TillSession[] }>("/till/handover/candidates", token);
  return data.sessions;
}

export async function createHandover(
  token: string,
  request: CreateHandoverRequest,
): Promise<TillHandover> {
  const data = await api.post<{ handover: TillHandover }>("/till/handover", request, token);
  return data.handover;
}

export async function fetchHandoverHistory(
  token: string,
): Promise<TillHandover[]> {
  const data = await api.get<{ handovers: TillHandover[] }>("/till/handover/history", token);
  return data.handovers;
}

export async function fetchTillReport(token: string): Promise<TillReportSummary> {
  const data = await api.get<{ summary: TillReportSummary }>("/till/report", token);
  return data.summary;
}
