export async function latestSeq(db) {
  const row = (await db.execute('SELECT COALESCE(MAX(seq),0) AS seq FROM djrpg_market_events')).rows[0];
  return Number(row.seq);
}
