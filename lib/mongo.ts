import 'server-only';
import { MongoClient, type Db, type Collection, type Document } from 'mongodb';

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!uri) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
}

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
  // eslint-disable-next-line no-var
  var _mongoClient: MongoClient | undefined;
}

let clientPromise: Promise<MongoClient>;
let client: MongoClient;

if (process.env.NODE_ENV === 'development') {
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri);
    global._mongoClient = client;
    global._mongoClientPromise = client.connect();
  } else {
    client = global._mongoClient!;
  }
  clientPromise = global._mongoClientPromise;
} else {
  client = new MongoClient(uri);
  clientPromise = client.connect();
}

export { clientPromise, client };

export async function getMongoClient(): Promise<MongoClient> {
  return clientPromise;
}

export async function getDb(dbName = 'mess'): Promise<Db> {
  const clientInstance = await getMongoClient();
  return clientInstance.db(dbName);
}

export async function getCollection<T extends Document = Document>(collectionName: string, dbName = 'mess'): Promise<Collection<T>> {
  const db = await getDb(dbName);
  return db.collection<T>(collectionName);
}
