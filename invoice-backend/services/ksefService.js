const axios = require('axios');
const { xml2js, js2xml } = require('xml-js');
const fs = require('fs').promises;
const path = require('path');
const { SignedXml } = require('xml-crypto');
const { handleKsefError, KsefError } = require('../utils/ksefErrorMapper');

const KSEF_API_URL_TEST = 'https://ksef-test.mf.gov.pl/api';

class KsefService {
    constructor(nip, longTermToken, userCertPath) {
        this.nip = nip;
        this.longTermToken = longTermToken; // Używany tylko do inicjalizacji sesji
        this.userCertPath = userCertPath; // Ścieżka do folderu użytkownika np. 'user_certs/1'
        this.sessionToken = null;
        this.sessionExpiresAt = null; // Do zarządzania wygasaniem sesji
        this.api = axios.create({ baseURL: KSEF_API_URL_TEST });
        this.privateKey = null;
    }

    /**
     * Wczytuje klucz prywatny użytkownika z bezpiecznej lokalizacji na dysku.
     * @private
     */
    async #loadPrivateKey() {
        if (this.privateKey) return;
        try {
            const keyPath = path.join(__dirname, '..', this.userCertPath, 'private_key.pem');
            this.privateKey = await fs.readFile(keyPath, 'utf8');
        } catch (error) {
            console.error(`Błąd wczytywania klucza prywatnego dla NIP ${this.nip}:`, error);
            throw new KsefError("Nie można wczytać klucza prywatnego z serwera. Upewnij się, że został poprawnie przesłany.", 500);
        }
    }

    /**
     * Sprawdza, czy sesja jest aktywna. Jeśli nie, inicjuje nową.
     * @private
     */
    async #ensureSession() {
        // Sprawdź, czy token istnieje i czy nie wygasł (z 1-minutowym buforem)
        if (this.sessionToken && this.sessionExpiresAt && Date.now() < this.sessionExpiresAt - 60000) {
            return;
        }
        
        console.log(`Inicjowanie nowej sesji KSeF dla NIP: ${this.nip}...`);
        await this.#loadPrivateKey();

        // Krok 1 & 2: Uzyskaj wyzwanie autoryzacyjne
        const challengeResponse = await this.#executeRequest(() => this.api.post('/online/Session/AuthorisationChallenge', {
            "contextIdentifier": { "type": "NIP", "identifier": this.nip }
        }));
        const { challenge, timestamp } = challengeResponse.data;

        // Krok 3: Stwórz XML i podpisz go cyfrowo
        const challengeXml = `
            <ns3:InitSessionRequest xmlns:ns2="http://ksef.mf.gov.pl/schema/gt/dfl/2021/10/01/0001" xmlns:ns3="http://ksef.mf.gov.pl/schema/gt/sbs/2021/10/01/0001">
                <ns3:Context>
                    <ns3:Challenge>${challenge}</ns3:Challenge>
                    <ns3:Identifier xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="ns2:SubjectIdentifierByNIPType">
                        <ns2:Identifier>${this.nip}</ns2:Identifier>
                    </ns3:Identifier>
                    <ns3:DocumentType>
                        <ns2:Service>KSeF</ns2:Service>
                        <ns2:FormCode>
                            <ns2:SystemCode>FA (2)</ns2:SystemCode>
                            <ns2:SchemaVersion>1-0E</ns2:SchemaVersion>
                        </ns2:FormCode>
                    </ns3:DocumentType>
                    <ns3:Token>${this.longTermToken}</ns3:Token>
                </ns3:Context>
            </ns3:InitSessionRequest>
        `;
        
        if (!this.privateKey) {
            throw new KsefError("Brak klucza prywatnego do podpisania wyzwania.", 500);
        }
        
        const sig = new SignedXml();
        sig.signingKey = this.privateKey;
        sig.addReference("//*[local-name(.)='InitSessionRequest']");
        sig.computeSignature(challengeXml, {
            prefix: "ds",
            attrs: {
                Id: "Signature"
            },
            location: {
                reference: "//*[local-name(.)='InitSessionRequest']",
                action: "append"
            }
        });
        const signedXml = sig.getSignedXml();
        
        // Krok 4 & 5: Wyślij podpisany XML, aby zainicjować sesję
        const initResponse = await this.#executeRequest(() => this.api.post('/online/Session/InitSessionSigned', signedXml, {
            headers: { 'Content-Type': 'application/octet-stream' }
        }));

        this.sessionToken = initResponse.data.sessionToken.token;
        this.sessionExpiresAt = new Date(timestamp).getTime() + (10 * 60 * 60 * 1000); // Sesja jest zazwyczaj ważna 10 godzin
        console.log("Sesja KSeF zainicjowana pomyślnie.");
    }

    /**
     * Generyczny wrapper do obsługi błędów zapytań do API KSeF.
     * @private
     * @param {Function} requestFunction - Funkcja wykonująca zapytanie axios.
     * @returns {Promise<any>}
     */
    async #executeRequest(requestFunction) {
        try {
            return await requestFunction();
        } catch (error) {
            throw handleKsefError(error);
        }
    }

    /**
     * Testuje połączenie i autoryzację z KSeF poprzez próbę zainicjowania sesji.
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async testSession() {
        await this.#ensureSession(); // Ta metoda rzuci błąd, jeśli coś pójdzie nie tak
        return { success: true, message: "Pomyślnie zainicjowano sesję z KSeF." };
    }

    /**
     * Pobiera listę nagłówków faktur dla danego okresu.
     * @param {string} startDate - Data w formacie YYYY-MM-DD.
     * @returns {Promise<Object>} - Sparsowana odpowiedź JSON z listą faktur.
     */
    async getInvoices(startDate) {
        await this.#ensureSession();
        
        const queryXml = js2xml({
            // ... (tutaj należy zbudować pełny, poprawny obiekt JSON, który zostanie przekonwertowany na XML zapytania)
            // Przykład uproszczony:
            QueryCriteria: {
                SubjectType: "subject2",
                Type: "incremental",
                AcquisitionTimestampThresholdFrom: `${startDate}T00:00:00Z`
            }
        }, { compact: true, spaces: 4 });

        const response = await this.#executeRequest(() => 
            this.api.post('/online/Query/Invoice/Sync', queryXml, {
                headers: { 
                    'Content-Type': 'application/octet-stream',
                    'SessionToken': this.sessionToken
                }
            })
        );
        return xml2js(response.data, { compact: true });
    }

    /**
     * Pobiera pełną, pojedynczą fakturę na podstawie jej numeru referencyjnego KSeF.
     * @param {string} ksefReferenceNumber - Numer referencyjny faktury w KSeF.
     * @returns {Promise<Object>} - Sparsowana odpowiedź JSON z pełnymi danymi faktury.
     */
    async getFullInvoice(ksefReferenceNumber) {
        await this.#ensureSession();
        
        const response = await this.#executeRequest(() => 
            this.api.get(`/online/Invoice/Get/${ksefReferenceNumber}`, {
                headers: { 'SessionToken': this.sessionToken }
            })
        );
        return xml2js(response.data, { compact: true });
    }
}

module.exports = KsefService;