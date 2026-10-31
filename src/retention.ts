import type pg from 'pg';
export async function applyRetention(pool:pg.Pool){
 // Pending and ambiguous submissions retain their payload for safe recovery.
 const terminal="('delivered_local','delivered_to_server','bounced','suppressed','cancelled','failed')";
 const previews=await pool.query(`UPDATE messages m SET text_body='',html='',payload_purged_at=now() WHERE m.payload_purged_at IS NULL AND m.status IN ${terminal} AND m.updated_at<now()-COALESCE((SELECT payload_retention_days FROM delivery_settings s WHERE s.org_id=m.org_id),7)*interval '1 day' RETURNING id`);
 const logs=await pool.query(`DELETE FROM events e USING messages m WHERE e.message_id=m.id AND m.status IN ${terminal} AND e.created_at<now()-COALESCE((SELECT log_retention_days FROM delivery_settings s WHERE s.org_id=m.org_id),30)*interval '1 day'`);
 await pool.query('DELETE FROM domain_setup_flows WHERE expires_at<now()');
 await pool.query('DELETE FROM oauth_flows WHERE expires_at<now()');
 await pool.query('DELETE FROM sessions WHERE expires_at<now()');
 return {previews:previews.rowCount,logs:logs.rowCount};
}
