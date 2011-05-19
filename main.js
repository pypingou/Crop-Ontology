require("apejs.js");
require("googlestore.js");

require("./fileupload.js");
require("./usermodel.js");


apejs.urls = {
    "/": {
        get: function(request, response) {
            var skin = render("skins/list-ontologies.html");
            response.getWriter().println(skin);
        }
    },
    "/ontology/([a-zA-Z0-9_\: ]+)": {
        get: function(request, response, matches) {
            var skin = render("skins/index.html")
                    .replace(/{{ontologyname}}/g, matches[1]);
            response.getWriter().println(skin);
        }
    },
    "/get-attribute": {
        get: function(request, response) {
            var term_id = request.getParameter("term_id");
            if(!term_id) return response.getWriter().println("No term_id");

            var q = googlestore.query("attribute");
            q.addFilter("term_id", "=", term_id);
            var res = q.fetch(50);

            var json = "[";
            for(var i=0; i<res.length; i++) {
                if(i != 0)
                    json += ",";

                var value = res[i].getProperty("value");
                if(value instanceof Blob) {
                    var filename = res[i].getProperty("filename");
                    var mimeType = ApeServlet.CONFIG.getServletContext().getMimeType(filename);
                    // based on the mime type we need to figure out which image to show
                    if(mimeType.startsWith("image")) {
                        value = "<a target='_blank' href='/serve/"+res[i].getKey().getName()+"'><img src='/serve/"+res[i].getKey().getName()+"' /></a>";
                    } else {
                        value = "<a target='_blank' href='/serve/"+res[i].getKey().getName()+"'>"+filename+"</a>";
                    }
                } else
                    value = value.getValue();

                json += "{ \"key\":\""+res[i].getProperty("key").replace("\"","\\\"") + "\", \"value\":\""+value.replace("\"","\\\"") + "\"} ";
            }
            json += "]";
            response.getWriter().println(json);
        }
    },
    "/add-attribute": {
        get: function(){},
        post: function(request, response) {
            function err(msg) { response.getWriter().println(msg); }
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
            googlestore.put(attribute);

            err("<script>window.top.fileupload_done();</script>");

        }
    },
    "/remove-attribute": {
        post: function(request, response) {
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
    "/serve/([a-zA-Z0-9_\: ]+)" : {
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
                
                if(!mimeType.startsWith("image")) // if it's not an image, download it
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
            /*
            var skin = render("skins/index.html")
                    .replace(/{{ontologyname}}/g, matches[1]);
            response.getWriter().println(skin);
            */
            var skin = render("skins/index.html")
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

            var q = googlestore.query("user");
            q.addFilter("username", "=", username);
            q.addFilter("password", "=", usermodel.sha1(password));

            var res = q.fetch(1);
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
                error = "This email doesn't exist!";

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
                response.sendError(response.SC_BAD_REQUEST, "not logged in");
                return;
            }
            var termId = request.getParameter("termId"),
                comment = request.getParameter("comment");

            if(comment == "" || termId == "") {
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
                var q = googlestore.query("comment");
                q.addFilter("termId", "=", termId);
                var comments = q.fetch(50); // FIXME limiting comments to 50
                var ret = [];
                for(var i=0; i<comments.length; i++) {
                    var comment = comments[i];
                    ret.push({
                        "created": comment.getProperty("created"),
                        "author": googlestore.get(comment.getProperty("userKey")).getProperty("username"),
                        "comment": comment.getProperty("comment").getValue()

                    });
                }
                response.getWriter().println(JSON.stringify(ret));
            } catch(e) {
            }
        }
    }
};
