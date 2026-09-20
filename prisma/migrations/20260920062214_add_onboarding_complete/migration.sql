-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Profile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "displayName" TEXT,
    "homeLocation" TEXT,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'en',
    "partyType" TEXT,
    "typicalDuration" INTEGER,
    "budgetMin" INTEGER,
    "budgetMax" INTEGER,
    "budgetCurrency" TEXT NOT NULL DEFAULT 'INR',
    "preferredDestinations" TEXT,
    "preferencesJson" TEXT NOT NULL DEFAULT '{}',
    "avoidancesJson" TEXT NOT NULL DEFAULT '{}',
    "knowledgeConfidence" REAL NOT NULL DEFAULT 0,
    "onboardingComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Profile" ("avoidancesJson", "budgetCurrency", "budgetMax", "budgetMin", "createdAt", "displayName", "homeLocation", "id", "knowledgeConfidence", "partyType", "preferencesJson", "preferredDestinations", "preferredLanguage", "typicalDuration", "updatedAt", "userId") SELECT "avoidancesJson", "budgetCurrency", "budgetMax", "budgetMin", "createdAt", "displayName", "homeLocation", "id", "knowledgeConfidence", "partyType", "preferencesJson", "preferredDestinations", "preferredLanguage", "typicalDuration", "updatedAt", "userId" FROM "Profile";
DROP TABLE "Profile";
ALTER TABLE "new_Profile" RENAME TO "Profile";
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
