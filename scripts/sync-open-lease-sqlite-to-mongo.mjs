import { MongoClient } from 'mongodb';
import { DatabaseSync } from 'node:sqlite';

const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DATABASE ?? 'kadastr_view';
const sqlitePath = process.env.OPEN_LEASE_SQLITE_PATH ?? 'storage/open-lease-data.sqlite';
const batchSize = Number(process.env.OPEN_LEASE_MONGO_BATCH_SIZE ?? 50);
const replaceCollection = process.env.OPEN_LEASE_MONGO_REPLACE === '1';
const compactSync = process.env.OPEN_LEASE_MONGO_SYNC_MODE !== 'full';

if (!uri) {
    console.error('MONGODB_URI is required.');
    process.exit(1);
}

const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
const client = new MongoClient(uri, {
    maxPoolSize: 2,
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 60000,
});

try {
    const rows = sqlite.prepare(compactSync ? compactRowsQuery() : 'SELECT * FROM parcel_open_rights ORDER BY rowid').all();
    await client.connect();
    const database = client.db(databaseName);
    let collection = database.collection('parcel_open_rights');
    let writtenCount = 0;

    if (replaceCollection) {
        await collection.drop().catch((error) => {
            if (error.codeName !== 'NamespaceNotFound') {
                throw error;
            }
        });
        collection = database.collection('parcel_open_rights');
    }

    console.log(`Syncing ${rows.length} SQLite open lease rows to MongoDB${compactSync ? ' in compact mode' : ''}...`);

    for (let index = 0; index < rows.length; index += batchSize) {
        const chunk = rows.slice(index, index + batchSize);
        const operations = chunk.map((row) => {
            const record = mongoRecordFromSqliteRow(row);

            return {
                updateOne: {
                    filter: {
                        source_url: record.source_url,
                        source_row_id: record.source_row_id,
                    },
                    update: {
                        $set: record,
                        $setOnInsert: { created_at: new Date() },
                    },
                    upsert: true,
                },
            };
        });
        const result = await collection.bulkWrite(operations, { ordered: false });

        writtenCount += result.upsertedCount + result.modifiedCount;
    }

    console.log(`SQLite to MongoDB sync finished. Matched rows: ${writtenCount}`);
} finally {
    sqlite.close();
    await client.close();
}

function compactRowsQuery() {
    const meaningfulValue = (column) => `
        nullif(trim(coalesce(${column}, '')), '') is not null
        and lower(trim(coalesce(${column}, ''))) not like 'http://%'
        and lower(trim(coalesce(${column}, ''))) not like 'https://%'
    `;
    const meaningfulWhere = `
        (${meaningfulValue('tenant')})
        or (${meaningfulValue('landlord')})
        or (${meaningfulValue('landlord_code')})
        or (${meaningfulValue('contract_number')})
        or (${meaningfulValue('contract_date')})
        or (${meaningfulValue('registered_at')})
        or (${meaningfulValue('valid_until')})
    `;

    return `
        SELECT *
        FROM parcel_open_rights
        WHERE rowid IN (
            SELECT max(rowid)
            FROM parcel_open_rights
            WHERE ${meaningfulWhere}
            GROUP BY cadastral_number_normalized
        )
        ORDER BY rowid
    `;
}

function mongoRecordFromSqliteRow(row) {
    return {
        cadastral_number: row.cadastral_number,
        cadastral_number_normalized: row.cadastral_number_normalized,
        right_type: row.right_type,
        tenant: row.tenant,
        landlord: row.landlord,
        landlord_code: row.landlord_code,
        contract_number: row.contract_number,
        contract_date: row.contract_date,
        registered_at: row.registered_at,
        valid_until: row.valid_until,
        lease_area: row.lease_area,
        land_use: row.land_use,
        address: row.address,
        source_name: row.source_name,
        dataset_title: row.dataset_title,
        dataset_name: row.dataset_name,
        publisher: row.publisher,
        dataset_url: row.dataset_url,
        resource_url: row.resource_url,
        source_url: row.source_url,
        source_row_id: row.source_row_id,
        imported_at: row.imported_at ? new Date(row.imported_at) : new Date(),
    };
}
