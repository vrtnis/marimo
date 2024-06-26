/* Copyright 2024 Marimo. All rights reserved. */
import { once } from "@/utils/once";
import { Logger } from "../../utils/Logger";
import { getMarimoServerToken } from "../dom/marimo-tag";
import { getSessionId } from "../kernel/session";

const getServerTokenOnce = once(() => {
  return getMarimoServerToken();
});

/**
 * Wrapper around fetch that adds XSRF token and session ID to the request and
 * strong types.
 */
export const API = {
  post<REQ, RESP = null>(
    url: string,
    body: REQ,
    opts: {
      headers?: Record<string, string>;
      baseUrl?: string;
    } = {},
  ): Promise<RESP> {
    const baseUrl = opts.baseUrl ?? document.baseURI;
    const fullUrl = `${baseUrl}api${url}`;
    return fetch(fullUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...API.headers(),
        ...opts.headers,
      },
      body: JSON.stringify(body),
    })
      .then(async (response) => {
        const isJson = response.headers
          .get("Content-Type")
          ?.startsWith("application/json");
        if (!response.ok) {
          const errorBody = isJson
            ? await response.json()
            : await response.text();
          throw new Error(response.statusText, { cause: errorBody });
        } else if (isJson) {
          return response.json() as RESP;
        } else {
          return response.text() as unknown as RESP;
        }
      })
      .catch((error) => {
        // Catch and rethrow
        Logger.error(`Error requesting ${fullUrl}`, error);
        throw error;
      });
  },
  get<RESP = null>(
    url: string,
    opts: {
      headers?: Record<string, string>;
      baseUrl?: string;
    } = {},
  ): Promise<RESP> {
    const baseUrl = opts.baseUrl ?? document.baseURI;
    const fullUrl = `${baseUrl}api${url}`;
    return fetch(fullUrl, {
      method: "GET",
      headers: {
        ...API.headers(),
        ...opts.headers,
      },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(response.statusText);
        } else if (
          response.headers.get("Content-Type")?.startsWith("application/json")
        ) {
          return response.json() as RESP;
        } else {
          return null as RESP;
        }
      })
      .catch((error) => {
        // Catch and rethrow
        Logger.error(`Error requesting ${fullUrl}`, error);
        throw error;
      });
  },
  headers() {
    return {
      "Marimo-Session-Id": getSessionId(),
      "Marimo-Server-Token": getServerTokenOnce(),
    };
  },
};
