-- 1. Engedélyezzük a UUID generátort (szükséges a skálázható egyedi azonosítókhoz)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ENUM (fix listás) típusok létrehozása a státuszok tiszta kezeléséhez
CREATE TYPE user_role AS ENUM ('GUEST', 'INDIVIDUAL_CLIENT', 'COMPANY_CLIENT', 'WORKER');
CREATE TYPE job_status AS ENUM ('PENDING_ASSIGNMENT', 'QUOTING', 'WAITING_FOR_CLIENT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE document_type AS ENUM ('ORIGINAL', 'TRANSLATED');
CREATE TYPE quote_status AS ENUM ('PENDING', 'ACCEPTED_BY_CLIENT', 'ACCEPTED_BY_WORKER', 'REJECTED');

-- 3. Felhasználók központi táblája
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE, -- Vendégeknél lehet NULL, ha később regisztrálnak, kitöltik
    name VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    company_tax_number VARCHAR(50), -- Csak cégeknél kötelező frontend oldalon
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Fordítók extra profil adatai (1:1 kapcsolat a users táblával)
CREATE TABLE worker_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    certifications TEXT[], -- Végzettségek listája (szöveges tömb)
    id_document_url VARCHAR(512) NOT NULL, -- Az igazolvány képe a felhőtárhelyen
    stripe_account_id VARCHAR(255), -- Stripe Connect azonosító az azonnali kifizetéshez
    is_verified BOOLEAN DEFAULT FALSE, -- Admin hagyja jóvá az igazolványok alapján
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Megbízások tábla
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES users(id), -- A megrendelő azonosítója
    status job_status NOT NULL DEFAULT 'PENDING_ASSIGNMENT',
    source_language VARCHAR(50) NOT NULL,
    target_language VARCHAR(50) NOT NULL,
    deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    budget DECIMAL(10, 2), -- Irányár vagy fix keret
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Dokumentumok tábla (Ide kerülnek a felhőbe feltöltött fájlok linkjei!)
CREATE TABLE job_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    uploaded_by_id UUID NOT NULL REFERENCES users(id),
    type document_type NOT NULL, -- ORIGINAL (lefordítandó) vagy TRANSLATED (kész munka)
    file_url VARCHAR(512) NOT NULL, -- A felhőtárhelyről kapott URL (pl. AWS S3 vagy Supabase)
    file_name VARCHAR(255) NOT NULL, -- Az eredeti fájlnév, amit a felhasználó lát (pl. doku.pdf)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Árajánlatok tábla a kiosztási folyamathoz
CREATE TABLE quotes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    worker_id UUID NOT NULL REFERENCES users(id),
    price DECIMAL(10, 2) NOT NULL,
    estimated_completion TIMESTAMP WITH TIME ZONE NOT NULL,
    status quote_status NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. INDEXEK A SKÁLÁZHATÓSÁGÉRT
-- Ha több százezer sor lesz az adatbázisban, ezek az indexek biztosítják, hogy a lekérdezések milliszekundumok alatt fussanak le.
CREATE INDEX idx_jobs_client_id ON jobs(client_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_job_documents_job_id ON job_documents(job_id);
CREATE INDEX idx_quotes_job_id ON quotes(job_id);
CREATE INDEX idx_quotes_worker_id ON quotes(worker_id);