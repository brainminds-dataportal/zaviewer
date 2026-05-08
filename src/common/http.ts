import axios from "axios";

export function isNotFoundError(error: unknown) {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

export async function getJson(url: string) {
  const response = await axios.get(url);
  return response.data;
}

export async function postFormJson(url: string, data: Record<string, string | number>) {
  const body = new URLSearchParams();

  Object.entries(data).forEach(([key, value]) => {
    body.append(key, String(value));
  });

  const response = await axios.post(url, body, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
  });

  return response.data;
}

export async function getText(url: string) {
  const response = await axios.get(url, {
    responseType: "text",
  });

  return response.data;
}

export async function getXmlDocument(url: string, mimeType = "application/xml") {
  const content = await getText(url);
  return new DOMParser().parseFromString(content, mimeType);
}
