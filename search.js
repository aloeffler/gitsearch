/* GitHub: Search users by language, output
 - username
 - full name
 - avatar URL
 - followers

 Input:
 - lang: language
 - size: number of records to output (default: 50, maximum: 1000)
 */

/* setup express server at port 3000 */
var express = require('express');
var app = express();
var server = app.listen(3000);

/* Use octonode as Github API wrapper for Node.js */
var gitHubAccess = require('octonode');

/**
 * GET: GitHub search request
 *
 * Parameters:
 *  lang  - language
 *  size  - number of requested records
 *  token - GitHub ID token
 */
app.get('/', function (req, res) {
    
    const languageError = 'Error: Language (lang) not defined';
    const tokenError = 'Error: Access token (token) not defined';
    
    var languageToSearchFor = req.query.lang;
    var requestedNbOfRecords = req.query.size;
    var userIdentificationToken = req.query.token;
    
    if (typeof languageToSearchFor == 'undefined') {
        console.log(languageError);
        return res.send(languageError);
    }
    if (typeof userIdentificationToken == 'undefined') {
        console.log(tokenError)
        return res.send(tokenError);
    }
    
    searchOnGitHub(languageToSearchFor, requestedNbOfRecords, userIdentificationToken, res);
});

/**
 * Perform GitHub search
 * @param languageToSearchFor     - Requested language to search for
 * @param requestedNbOfRecords    - Max records to retrieve
 * @param userIdToken             - GitHub user ID token to increase search limit
 * @param res                     - Result of GET function
 */
function searchOnGitHub(languageToSearchFor, requestedNbOfRecords, userIdToken, res) {

    const noLanguageRequested = null;
    const noRecordsRequested = null;
    const notHTTPcall = null;
    const noLanguageDefinedMessage = 'No language defined';
    const processingRequestMessage = 'Processing request...';

    var recordsToReturn = requestedNbOfRecords;

    /* Declare variables for query results and final result */
    var generalUserInfo = [];                 // temporary variable for user data for each page
    var finalRecords = [];                    // variable to hold final result
    var nbOfFoundRecords = 0;                 // count retrieved records

    /* declare processing variables */
    var currentParallelProcesses = 0;         // current number of parallel proesses
    var processLimit = 1010;                  // maximum of parallel processes
    var allPagesProcessed = false;            // true: all pages for language search have been processed
    var gitHubClient = gitHubAccess.client(userIdToken); // initialize client with token
    var ghsearch = gitHubClient.search();     // initialize search client
    var currentPageNumber = 0;                // initialize page counter
    var recordsPerPage = 100;                 // records per page (max. delivered by per Github API request)

    var totalNbOfPages;

    if (languageToSearchFor == noLanguageRequested)
        return noLanguageDefinedMessage;

    if (requestedNbOfRecords == noRecordsRequested
        || requestedNbOfRecords.NaN
        || requestedNbOfRecords < 0)
        recordsToReturn = 50;

    if (requestedNbOfRecords > 1000)
        recordsToReturn = 1000;

    recordsToReturn = Math.floor(recordsToReturn);
    
    /* calculate optmial recordsPerPage and totalNbOfPages parameters */
    if (requestedNbOfRecords < recordsPerPage)
        recordsPerPage = recordsToReturn;
    totalNbOfPages = Math.floor((recordsToReturn - 1) / recordsPerPage) + 1;

    /* start processing */
    fetchNextPage();

    return processingRequestMessage;

    /* top level query for users with the specified language, split up in pages */
    function fetchNextPage() {

        /* update parallel processing and page parameters */
        currentParallelProcesses++;  // increment parallel process count
        currentPageNumber++;         // increment page number each time a new query is prepared

        /* start query */
        ghsearch.users({
            sort: 'created',
            order: 'asc',
            page: currentPageNumber,
            per_page: recordsPerPage,
            access_token: userIdToken,
            q: 'language:' + languageToSearchFor + '&type:user'
        }, pageQueryResult);

        /* manage parallel processing:
         if parallel limit not reached, look for next page in parallel,
         but only if sufficient records are found after 1st request */
        if ((currentPageNumber > 1)
            && (currentParallelProcesses < processLimit)
            && (currentPageNumber < totalNbOfPages))
            fetchNextPage();
    }

    /* process query results */
    function pageQueryResult(err, body, header) {

        var totalAvailableRecords = body.total_count;
        var availablePages, searchLimit;
        var errorMessage = 'Error';

        /* error handling */
        if (err || body == null) {
            if (err)
                errorMessage += ': ' + err.message;
            console.log(errorMessage);
            if (res != notHTTPcall)
                res.send(errorMessage);
            return;
        }

        /* after first run, compare totalNbOfPages with available records.
         If less results than requested by user, reduce totalNbOfPages accordingly */
        if (currentPageNumber == 1) {
            availablePages = Math.floor((totalAvailableRecords - 1) / recordsPerPage) + 1;
            searchLimit = Math.floor(999 / recordsPerPage) + 1;
            
            if (availablePages < totalNbOfPages)  // IF less pages of users available than requested
                totalNbOfPages = availablePages;  // THEN set totalNbOfPages to available pages
            
            if (searchLimit < totalNbOfPages)     // IF user requested more records than Github API allows (1000)
                totalNbOfPages = searchLimit;     // THEN adjust number of pages to this limit
        }
        
        currentParallelProcesses--;

        /* if anything is left to process, do so */
        if (body.items.length > 0 && nbOfFoundRecords < recordsToReturn) {
            getUserNames(body.items);
            
            if (currentPageNumber < totalNbOfPages)
                fetchNextPage();
        }
    }

    /* extract username from query result and store in generalUserInfo[] */
    function getUserNames(userRecord) {

        /* check if userdata is valid and extract username from each page entry */
        if (userRecord != null)
            while ((userRecord.length > 0) && (nbOfFoundRecords++ < recordsToReturn)) {
                generalUserInfo.push({
                    login: userRecord[0].login
                });
                userRecord.shift();
            }

        /* process usernames */
        if (nbOfFoundRecords >= recordsToReturn)
            allPagesProcessed = true;
        if (currentParallelProcesses < processLimit)
            getDetailedUserInfo();
    }

    /* fetch required fields from each user */
    function getDetailedUserInfo() {
        if (generalUserInfo.length > 0) {

            /* prepare query for user details */
            var fetchUserDetails = '/users/' + generalUserInfo[0].login;

            generalUserInfo.shift();        // prepare next login name
            currentParallelProcesses++;     // increase parallel process count

            /* start query */
            gitHubClient.get(fetchUserDetails, processDetails);

            /* manage parallel processing */
            if (currentParallelProcesses < processLimit) // if parallel limit not reached, launch next process
                if (currentPageNumber < totalNbOfPages)  // fetch new page as soon as possible
                    fetchNextPage();
                else                                     // if no pages are left, continue fetching user details
                    getDetailedUserInfo();
        }
    }

    /* process query results */
    function processDetails(err, status, body) {
        /* parallel process handling */
        currentParallelProcesses--; // process finished, decrease parallel count

        /* error handling */
        if (err) {
            console.log("Error: " + err.message);
            if (res != notHTTPcall)
                res.send("Error:\n", err.message);
            return;
        }

        /* add user details to finalRecords list */
        finalRecords.push({
            login: body.login,               // username
            name: body.name,                 // full name
            avatar_url: body.avatar_url,     // avatar url
            followers: body.followers        // number of followers
        });

        /* parallel process handling */
        /* if process counter is back to 0 and no data or pages are left to process, finish */
        if ((currentParallelProcesses == 0) && (generalUserInfo.length == 0) && allPagesProcessed)
            sendResultToUser(finalRecords);  // search finished, ready to return result
        else {
            if (currentPageNumber < totalNbOfPages)   // fetch new page as soon as possible
                fetchNextPage();
            else                             // if no pages are left, continue fetching user details
                getDetailedUserInfo();
        }
    }

    /* search finished, check remaining quota (can be removed after testing), return result */
    function sendResultToUser(allFoundRecords) {
        console.log(allFoundRecords);        // display result as a log
        if (res != notHTTPcall)              // if called via HTTP get request, send result
            res.send(allFoundRecords);
    }
}
