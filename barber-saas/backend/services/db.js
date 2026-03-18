import mongoose from "mongoose";

export async function connectDatabase() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGO_URI nao definido no ambiente");
  }

  await mongoose.connect(uri, {
    autoIndex: true
  });

  console.log("Mongo conectado");
}
