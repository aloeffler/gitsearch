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

/**
 * GET: GitHub search request
 *
 * Parameters:
 *  lang: language
 *  size: number of requested records
 */
app.get('/', function (req, res) {
    /* retrieve input parameters, verify that language is defined */
    if (typeof req.query.lang == 'undefined') {
        console.log('Error: Language not defined')
        return res.send('Error: Language (lang) not defined');
    }
    if (typeof req.query.token == 'undefined') {
        console.log('Error: Access token not defined')
        return res.send('Error: Access token (token) not defined');
    }
    var lang = req.query.lang;   // language to search for
    var size = req.query.size;   // number of records to retrieve as an integer value
    var token = req.query.token; // get token

    /* start search */
    search(lang, size, token, res);
});

/* Use octonode as Github API wrapper for Node.js */
var github = require('octonode');

/**
 * Perform GitHub search
 * @param lang - Requested language to search for
 * @param size - max records to retrieve
 */
function search(lang, size, token, res) {
    /* check validity of input parameters */
    if (lang == null)                         // if no language is given, exit
        return 'No language defined';
    if (size == null || size.NaN || size < 0) // set size to 50 if not a number or <0
        size = 50;
    if (size > 1000)                          // limit size to 1000
        size = 1000;
    size = Math.floor(size);                  // convert to integer

    /* Declare variables for query results and final result */
    var logindata = [];                       // temporary variable for user data for each page
    var finaldata = [];                       // variable to hold final result
    var records_found = 0;                    // count retrieved records

    /* declare processing variables */
    var par_current = 0;                      // current number of parallel proesses
    var par_limit = 1010;                     // maximum of parallel processes

    var finished_pages = false;               // true: all pages for language search have been processed

    var client = github.client(token);        // initialize client with token
    var ghsearch = client.search();           // initialize search client
    var page = 0;                             // initialize page counter
    var per_page = 100;                       // records per page (max. delivered by per Github API request)

    console.log('Language: ' + lang + ', Records: ' + size + ', Token: ' + token);  // verify search string and size

    /* calculate optmial per_page and nb_pages parameters */
    if (size < per_page) // if less records are requested than current per_page size, adjust accordingly
        per_page = size;
    var nb_pages = Math.floor((size - 1) / per_page) + 1; // calculate number of pages needed

    /* start processing */
    parse_pages();

    return 'Processing request...';

    /* top level query for users with the specified language, split up in pages */
    function parse_pages() {
        //console.log('Starting new page');

        /* update parallel processing and page parameters */
        par_current++;  // increment parallel process count
        page++;         // increment page number each time a new query is prepared

        /* start query */
        ghsearch.users({
            sort: 'created',
            order: 'asc',
            page: page,
            per_page: per_page,
            access_token: token,                 // use token to apply a query limit of 5000
            q: 'language:' + lang + '&type:user' // set language and only look for users, not organizations
        }, page_query_start);

        /* manage parallel processing:
         if parallel limit not reached, look for next page in parallel,
         but only if sufficient records are found after 1st request */
        //console.log('PAGE page:', page, 'process count:', par_current);
        if ((page > 1) && (par_current < par_limit) && (page < nb_pages))
            parse_pages();

        /* process query results */
        function page_query_start(err, body, header) {
            /* error handling */
            if (err || body == null) {
                var message = 'Error';
                if (err)
                    message += ': ' + err.message;
                console.log(message);
                if (res != null)
                    res.send(message);
                return;
            }

            /* after first run, compare nb_pages with available records.
             If less results than requested by user, reduce nb_pages accordingly */
            if (page == 1) {
                var available_pages = Math.floor((body.total_count - 1) / per_page) + 1;
                var query_limit = Math.floor(999 / per_page) + 1;
                if (available_pages < nb_pages) // IF less pages of users available than requested
                    nb_pages = available_pages; // THEN set nb_pages to available pages
                if (query_limit < nb_pages)     // IF user requested more records than Github API allows (1000)
                    nb_pages = query_limit;     // THEN adjust number of pages to this limit
                //console.log('Pages: per_page:' + per_page + ' available:'
                //    + available_pages + ' query_limit:' + query_limit + ' nb_pages:', nb_pages);
            }

            /* parallel process handling */
            par_current--; // process finished, decrease parallel count

            /* if anything is left to process, do so */
            if (body.items.length > 0 && records_found < size) {
                //console.log(' body.length:', body.items.length, '\n header:', header.link);

                /* process message body */
                get_usernames(body.items); // extract usernames from result

                /* if there are pages left, process next page */
                //console.log('records_found:', records_found);
                if (page < nb_pages)
                    parse_pages();
            }
        }

        /* extract username from query result and store in logindata[] */
        function get_usernames(data) {
            //console.log('Parser started: userdata.length =', data.length);

            /* check if userdata is valid and extract username from each page entry */
            if (data != null)
                while ((data.length > 0) && (records_found++ < size)) {
                    logindata.push({ // add username (login) to logindata list
                        login: data[0].login
                    });
                    data.shift();
                }
            //console.log('Language parser finished:', logindata.length,
            //    '\nRecords found so far:', records_found);

            /* process usernames */
            if (records_found >= size) // if size limit has been reached, set finished_pages
                parse_pages_finished();
            if (par_current < par_limit) // start parsing usernames in parallel if a process is available
                parse_usernames();
        }
    }

    /* set finished_pages flag to indicate that all pages have been retrieved */
    function parse_pages_finished() {
        finished_pages = true;
        //console.log('FINISHED PAGES');
    }

    /* fetch required fields from each user */
    function parse_usernames() {
        if (logindata.length > 0) {
            //console.log(' Parser process', par_current, 'for user', logindata[0].login);

            /* prepare query for user details */
            var user_search_string = '/users/' + logindata[0].login; // generate search string
            logindata.shift(); // prepare next login name
            par_current++;     // increase parallel process count

            /* start query */
            client.get(user_search_string, user_query_start);

            /* manage parallel processing */
            if (par_current < par_limit) // if parallel limit not reached, launch next process
                if (page < nb_pages)        // fetch new page as soon as possible
                    parse_pages();
                else                        // if no pages are left, continue fetching user details
                    parse_usernames();
        }

        /* process query results */
        function user_query_start(err, status, body) {
            /* parallel process handling */
            par_current--; // process finished, decrease parallel count

            /* error handling */
            if (err) {
                console.log("Error: " + err.message);
                if (res != null)
                    res.send("Error:\n", err.message);
                return;
            }


            /* add user details to finaldata list */
            finaldata.push({
                login: body.login,           // username
                name: body.name,             // full name
                avatar_url: body.avatar_url, // avatar url
                followers: body.followers    // number of followers
            });
            //console.log(' remain process', par_current, ' processed:', body.login);

            /* parallel process handling */
            /* if process counter is back to 0 and no data or pages are left to process, finish */
            if ((par_current == 0) && (logindata.length == 0) && finished_pages)
                search_finished(finaldata);  // search finished, ready to return result
            else {
                if (page < nb_pages)         // fetch new page as soon as possible
                    parse_pages();
                else                         // if no pages are left, continue fetching user details
                    parse_usernames();
            }
        }
    }

    /* search finished, check remaining quota (can be removed after testing), return result */
    function search_finished(data) {
        console.log(data); // display result as a log
        if (res != null)   // if called via HTTP get request, send result
            res.send(data);
    }
}
