exports.handleKsefError = (error) => {
    if (error instanceof KsefError) {
        return error;
    }

    if (error.response && error.response.data && error.response.data.exception) {
        const ex = error.response.data.exception;
        const detail = ex.exceptionDetailList[0];
        console.error(`Błąd KSeF: ${detail.exceptionCode} - ${detail.exceptionDescription}`);

        switch (detail.exceptionCode) {
            case 21301: // SessionToken does not exist
            case 21305: // Session has been terminated
                return new KsefError("Sesja wygasła lub jest nieprawidłowa. Spróbuj ponownie.", 401);
            case 21326: // Authentication negative
                return new KsefError("Błąd autoryzacji: Sprawdź swój token KSeF lub podpis cyfrowy.", 401);
            case 21101: // Context identifier is not compliant with the pattern
                return new KsefError("Błąd w zapytaniu: Podany identyfikator (NIP) jest nieprawidłowy.", 400);
            default:
                return new KsefError(`Błąd KSeF: ${detail.exceptionDescription}`, 500);
        }
    }
    
    console.error("Nieznany błąd KSeF:", error);
    return new KsefError("Błąd połączenia z serwerem KSeF.", 503);
};

class KsefError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.name = 'KsefError';
        this.statusCode = statusCode;
    }
}

exports.KsefError = KsefError;