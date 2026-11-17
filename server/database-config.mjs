let factory;

export function configureDatabase(createClient) { factory = createClient; }
export function databaseFactory() { return factory; }
