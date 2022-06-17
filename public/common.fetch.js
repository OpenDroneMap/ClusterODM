export const postFetch = async (url, { body }) => {
  return await fetch(url, {
    method: "post",
    cache: "no-cache",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
};

export const patchFetch = async (url, { body }) => {
  return await fetch(url, {
    method: "get",
    cache: "no-cache",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
};

export const deleteFetch = async (url, { body }) => {
  return await fetch(url, {
    method: "delete",
    cache: "no-cache",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
};
