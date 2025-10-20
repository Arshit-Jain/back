// test.js
import OpenAI from "openai";
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY // make sure this is set in your .env
});

const main = async () => {
  const models = await openai.models.list();
  console.log(models.data.map(m => m.id));
};

main();