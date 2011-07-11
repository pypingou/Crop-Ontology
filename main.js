require("apejs.js");
require("googlestore.js");

require("./fileupload.js");
require("./usermodel.js");

var VERSION = "0.0.5";

apejs.urls = {
    "/": {
        get: function(request, response) {
            var skin = render("skins/index.html")
                        .replace(/{{CONTENT}}/g, render("skins/list-ontologies.html"))
                        .replace(/{{VERSION}}/g, VERSION);
            response.getWriter().println(skin);
            
        }
    },
    "/ontologies": {
        get: function(request, response) {
            var ontologies = googlestore.query("ontology")
                    .fetch();

            var res = [];
            ontologies.forEach(function(onto){
                res.push({
                    id: ""+onto.getProperty("id"),
                    name: ""+onto.getProperty("name")
                });
            });

            response.getWriter().println(JSON.stringify(res));
            
        }
    },
    "/ontology/([a-zA-Z0-9_\: ]+)": {
        get: function(request, response, matches) {
            var skin = render("skins/index.html")
                    .replace(/{{CONTENT}}/g, render("skins/onto.html"))
                    .replace(/{{VERSION}}/g, VERSION)
                    .replace(/{{ontologyid}}/g, matches[1]);
            response.getWriter().println(skin);
        }
    },
    "/get-ontology/([a-zA-Z0-9_\: ]+)": {
        get: function(request, response, matches) {
            require("./blobstore.js");

            var ontoId = matches[1];
            try {
                // get this ontology data from it's id
                var ontoKey = googlestore.createKey("ontology", ontoId),
                    ontoEntity = googlestore.get(ontoKey);

                var jsonBlobKey = ontoEntity.getProperty("jsonBlobKey");
                    
                // just use serve() to get the jsonString from the blobstore
                blobstore.blobstoreService.serve(jsonBlobKey, response);

            } catch (e) {
                response.sendError(response.SC_BAD_REQUEST, e);
            }
        }
    },
    "/get-attribute": {
        get: function(request, response) {
            var term_id = request.getParameter("term_id");
            if(!term_id) return response.getWriter().println("No term_id");

            var res = googlestore.query("attribute")
                    .filter("term_id", "=", term_id)
                    .fetch();

            var attributes = [];
            for(var i=0; i<res.length; i++) {

                var value = res[i].getProperty("value");
                if(value instanceof Blob) {
                    var filename = res[i].getProperty("filename");
                    var mimeType = ApeServlet.CONFIG.getServletContext().getMimeType(filename);
                    // based on the mime type we need to figure out which image to show
                    if(!mimeType || !mimeType.startsWith("image")) { // default to plain text
                        value = "<a target='_blank' href='/serve/"+res[i].getKey().getName()+"'>"+filename+"</a>";
                    } else {
                        value = "<a target='_blank' href='/serve/"+res[i].getKey().getName()+"'><img src='/serve/"+res[i].getKey().getName()+"' /></a>";
                    }
                } else
                    value = value.getValue();

                attributes.push({
                    "key": ""+ res[i].getProperty("key"),
                    "value": ""+value
                });

            }
            response.getWriter().println(JSON.stringify(attributes));
        }
    },
    "/add-attribute": {
        get: function(){},
        post: function(request, response) {
            function err(msg) { response.getWriter().println('<script>window.top.fileupload_done("'+msg+'");</script>'); }
            // only if logged in
            var session = request.getSession(true);
            var userKey = session.getAttribute("userKey");
            if(!userKey) {
                return err("Not logged in");
            }
            // get the multipart form data from the request

            var key = "", value = "", term_id = "", filename = "";
            var data = fileupload.getData(request);

            for(var i=0; i<data.length; i++) {
                var fieldName = data[i].fieldName,
                    fieldValue = data[i].fieldValue,
                    isFile = data[i].file;

                if(isFile) {
                    //err("Got file with name: "+fieldName+"<br>");
                    filename = fieldName;
                    value = fieldValue;
                } else {
                    if(fieldName == "key") key = fieldValue; 
                    if(fieldName == "value") value = fieldValue;
                    if(fieldName == "term_id") term_id = fieldValue;
                    //err("Got form-field. "+fieldName+": "+fieldValue+"<br>");
                }
            }

            if(key == "" || value == "" || term_id == "")
                return err("Must complete all fields");

            // the key is just key_GO:0000
            var attribute = googlestore.entity("attribute", key+"_"+term_id, {
                key: key,
                filename: filename,
                value: (value instanceof Blob ? value : new Text(value)),
                term_id: term_id
            });
            // only if logged in and has permissions
            googlestore.put(attribute);

            err("");

        }
    },
    "/remove-attribute": {
        post: function(request, response) {
            function err(msg) { response.getWriter().println('<script>window.top.fileupload_done("'+msg+'");</script>'); }
            // only if logged in
            var session = request.getSession(true);
            var userKey = session.getAttribute("userKey");
            if(!userKey) {
                return err("Not logged in");
            }

            var key = request.getParameter("key"),
                term_id = request.getParameter("term_id");
            if(key == "" || term_id == "")
                return;

            var k = googlestore.createKey("attribute", key + "_" + term_id);
            googlestore.del(k);
        }
    },
    "/httpget": {
        get: function(request, response) {
            require("./httpget.js");
            var url = request.getParameter("url"),
                contentType = request.getParameter("contentType");
            var ret = httpget(url);
            response.setContentType("text/xml");

            if(contentType && contentType != "")
                response.setContentType(contentType);

            response.getWriter().println(ret);
        }
    },
    "/serve/([a-zA-Z0-9_\: \-]+)" : {
        get: function(request, response, matches) {
            //response.setHeader("Cache-Control", "max-age=315360000");

            var keyName = matches[1],
                // create key from the user id
                attrKey = googlestore.createKey("attribute", keyName),
                attr = googlestore.get(attrKey);

            var value = attr.getProperty("value");

            if(value instanceof Blob) {
                var bytes = value.getBytes();
                var filename = attr.getProperty("filename");
                var mimeType = ApeServlet.CONFIG.getServletContext().getMimeType(filename);

                response.setContentType(mimeType);
                
                if(!mimeType && !mimeType.startsWith("image")) // if it's not an image, download it
                    response.setHeader("Content-Disposition", "attachment; filename=\"" + filename+"\"");

                response.getOutputStream().write(bytes);
            } else if (value instanceof Text) { // plain text
                response.setContentType("text/plain");
                response.getWriter().println(value.getValue());
            } else {
                response.setContentType("text/plain");
                response.getWriter().println(value);
            }

        }
    },
    "/terms/(.*)/([a-zA-Z0-9_\: ]+)" : {
        get: function(request, response, matches) {
            var skin = render("skins/term.html")
                        .replace(/{{term_name}}/g, matches[1])
                        .replace(/{{term_id}}/g, matches[2]);
            response.getWriter().println(skin);
        }
    },
    "/search" : {
        get: function(request, response, matches) {
            var skin = render("skins/index.html")
                        .replace(/{{VERSION}}/g, VERSION)
                        .replace(/{{searchQuery}}/g, request.getParameter("q"));
            response.getWriter().println(skin);
        }
    },
    "/login" : {
        get: function(request, response) {
            // start the session
            var session = request.getSession(true);
            var userKey = session.getAttribute("userKey");

            // find user with this key and return its data
            var user = googlestore.get(userKey),
                username = "";
            if(user)
                username = user.getProperty("username");
            response.getWriter().println('{"username":"'+username+'"}');
        },
        post: function(request, response) {
            var username = request.getParameter("username"),
                password = request.getParameter("password");

            var res = googlestore.query("user")
                .filter("username", "=", username)
                .filter("password", "=", usermodel.sha1(password))
                .fetch(1);

            if(!res.length) { // user not found 
                response.getWriter().println("Username or password is wrong!");
            } else {
                var userKey = res[0].getKey();
                var session = request.getSession(true);
                session.setAttribute("userKey", userKey);
            }
        }
    },
    "/logout": {
        get: function(request, response) {
            var session = request.getSession(true);
            session.invalidate(); 
        }
    },
    "/register": {
        post: function(request, response) {
            var user = {
                created: new java.util.Date(),
                username: request.getParameter("username"),
                email: request.getParameter("email"),
                password: request.getParameter("password")
            }, o = {}, error = false;

            for(var i in user)
                if(user[i] == "") error = "Complete the entire form!";


            if(usermodel.emailExists(user.email))
                error = "This email already exists!";

            // check email format
            if(!usermodel.validateEmail(user.email))
                error = "Email is formatted incorrectly";

            if(usermodel.usernameExists(user.username))
                error = "This username already exists";
                
            if(!usermodel.validUsername(user.username))
                error = "The username is not of valid format";

            if(error) {
                response.getWriter().println('{"error":"'+error+'"}');
            } else {
                // sha1 the password
                user.password = usermodel.sha1(user.password);

                var entity = googlestore.entity("user", user);
                var userKey = googlestore.put(entity);

                // store the actualy key in the session
                var session = request.getSession(true);
                session.setAttribute("userKey", userKey);

            }
                
        }
    },
    "/add-comment" : {
        post: function(request, response) {
            var session = request.getSession(true);
            var userKey = session.getAttribute("userKey");
            if(!userKey) {
                response.sendError(response.SC_FORBIDDEN);
                return;
            }
            var termId = request.getParameter("termId"),
                comment = request.getParameter("comment");

            if(!comment || comment == "" || !termId || termId == "") {
                response.sendError(response.SC_BAD_REQUEST, "missing paramaters");
                return;
            }

            var comment = googlestore.entity("comment", {
                termId: termId,
                userKey: userKey,
                created: new java.util.Date(),
                comment: new Text(comment)
            });

            googlestore.put(comment);
        }
    },
    "/get-comments" : {
        post: function(request, response) {
            var termId = request.getParameter("termId");
            if(termId == "" || !termId) {
                response.sendError(response.SC_BAD_REQUEST, "missing paramaters");
                return;
            }
            // get comments for this term id
            try {
                var comments = googlestore.query("comment")
                    .filter("termId", "=", termId)
                    .fetch();
                var ret = [];
                for(var i=0; i<comments.length; i++) {
                    var comment = comments[i];
                    // conver them all to JS strings so the JSON.stringify can read them
                    ret.push({
                        "created": ""+comment.getProperty("created"),
                        "author": ""+googlestore.get(comment.getProperty("userKey")).getProperty("username"),
                        "comment": ""+comment.getProperty("comment").getValue()

                    });
                }
                response.getWriter().println(JSON.stringify(ret));
            } catch(e) {
            }
        }
    },
    "/add-ontology" : {
        get: function(request, response) {
            require("./blobstore.js");
            var UPLOAD_URL = blobstore.createUploadUrl("/obo-upload");
            var html = render("./skins/index.html")
                        .replace(/{{CONTENT}}/g, render("skins/add-ontology.html"))
                        .replace(/{{UPLOAD_URL}}/g, UPLOAD_URL)
                        .replace(/{{VERSION}}/g, VERSION);
            response.getWriter().println(html);
        },
        post: function(request, response) {
            require("./blobstore.js");
            var json = request.getParameter("json");

            try {
                // let's parse it so we know it's fine
                var arr = JSON.parse(json);

                var ontoName = arr[0].name,
                    ontoId = arr[0].id;

                // let's create the JSON in the blobstore
                var jsonBlobKey = blobstore.writeString(JSON.stringify(arr));

                var ontoEntity = googlestore.entity("ontology", ontoId, {
                    created: new java.util.Date(),
                    id: ontoId,
                    name: ontoName,
                    jsonBlobKey: jsonBlobKey
                });
                googlestore.put(ontoEntity);
            } catch(e) {
                return response.sendError(response.SC_BAD_REQUEST, e);
            }
        
        }
    },
    "/edit-ontology" : {
        get: function(request, response) {
            var html = render("./skins/add-ontology.html")
                        .replace(/{{VERSION}}/g, VERSION);
            response.getWriter().println(html);
        }
    },
    "/serve" : {
        get: function(request, response) {
            require("./blobstore.js");
            var blobKey = new BlobKey(request.getParameter("blob-key"));

            blobstore.blobstoreService.serve(blobKey, response);
        }
    },
    "/obo-upload" : {
        post: function(request, response) {
            require("./blobstore.js");

            var blobs = blobstore.blobstoreService.getUploadedBlobs(request),
                oboBlobKey = blobs.get("obofile");

            if(oboBlobKey == null) {
                return response.sendRedirect("/");
            }

            // redirect to obo-to-json which takes this oboBlobKey as a parameter
            response.sendRedirect("/obo-to-json?oboBlobKey="+oboBlobKey.getKeyString());
        }
    },
    /**
     * finds the OBO blob and converts it to a JSON
     * blob which is also then inserted in the blob store and a reference of it
     * is added to the ontology entity
     */
    "/obo-to-json": {
        get: function(request, response) {
            require("./blobstore.js");
            require("./public/js/jsonobo.js"); // also client uses this, SWEET!!!

            var oboBlobKey = new BlobKey(request.getParameter("oboBlobKey"));
            if(!oboBlobKey)
                return response.sendError(response.SC_BAD_REQUEST, "missing parameter");

            try {
                // let's use BlobstoreInputStream to read more than 1mb at a time
                var oboString = blobstore.read(oboBlobKey);

                // convert the OBO to JSON
                var arr = jsonobo.obotojson(oboString),
                    jsonString = JSON.stringify(arr);

                // now i need to put this JSON inside the blobstore.
                // use the blobstore api to put data inside store. there's no
                // bandwith transfer so don't need to go through servlet. it's just
                // processing CPU power
                var jsonBlobKey = blobstore.writeString(jsonString);

                // now that both the jsonString and oboString are inside the blobstore
                // create the ontology entity
                var ontoName = arr[0].name,
                    ontoId = arr[0].id;

                var ontoEntity = googlestore.entity("ontology", ontoId, {
                    created: new java.util.Date(),
                    id: ontoId,
                    name: ontoName,
                    // references to the blobstore data
                    oboBlobKey: oboBlobKey,
                    jsonBlobKey: jsonBlobKey
                });
                googlestore.put(ontoEntity);

                response.sendRedirect("/");
            } catch(e) {
                return response.sendError(response.SC_BAD_REQUEST, e);
            }

        }
    }
};
