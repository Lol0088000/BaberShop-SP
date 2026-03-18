import axios from "axios";

export async function sendWhatsapp(phone, message) {
  const url = process.env.ZAPI_URL;
  if (!url) {
    return;
  }

  const token = process.env.ZAPI_TOKEN;

  await axios.post(
    url,
    {
      phone,
      message
    },
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    }
  );
}
