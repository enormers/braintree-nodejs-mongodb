var braintree = require('braintree'),
bodyParser = require('body-parser'),
express = require("express"),
mongoClient = require('mongodb').MongoClient,
mongodbObjectID = require('mongodb').ObjectID,
server, dbCollectionsUser,
app = express(),
gateway = braintree.connect({

  environment: braintree.Environment.Sandbox,
  merchantId: 'b46cgvjvq3mf58pn',
  publicKey: 'n9sb4kj3kv9djmvv',
  privateKey: '038f8844e67afc1f1f60342477b09d9e'

});


// Connect to the db
mongoClient.connect('mongodb://localhost:27017/mynode', function(err, db) {

  if(!err) {
  
  	 dbCollectionsUser = db.collection('user');
  
     console.log("We are connected to mynode mongodb");     
    
  } else {
  
  	 console.log("Failed to connect to mynode mongodb");
  	 
  	 console.dir(err);
  	
  	 process.exit(1);
  
  }
  
});

var allowCrossDomain = function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With, Accept');
	next();
};

app.use(allowCrossDomain);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());


server = app.listen(8008, function () {

  console.log('Your Node.js app listening at port 8008');
  
});

/******************************************************
*
* This is a function that create a subscription in braintree 
* and then update our database
*
******************************************************/
var createBraintreeSubscriptionAndUpdateDb = function(paymentMethodToken, subscriptionPlanId, userid, userSubsciptionExistInDb, callback) {

    gateway.subscription.create({
            paymentMethodToken: paymentMethodToken,
            planId: subscriptionPlanId,
            merchantAccountId: 'merchantAccountIdUSD'
        //firstBillingDate: '2015-10-02'
        }, 
        function (err, result) {
        
            if(!err && result.success) {

                var subscription = {

                    id:result.subscription.id,
                    planid:subscriptionPlanId,
                    date_subscribed:new Date()

                };
                
                var updateStatement = {$push:{subscription:subscription}};
                
                if(!userSubsciptionExistInDb) {
                    
                    var arr = [];
                    
                    arr.push(subscription);
                    
                    updateStatement = {$set:{subscription:arr}};
                    
                }

                // update your database
                dbCollectionsUser.update(
                    {_id:userid},
                    updateStatement, 
                    {w:1}, 
                    function(err, result) {

                        if(!err) {

                            if(result.result.nModified < 1) {

                                console.log('Failed to update subscription for userid : ' + userid + ' | ' + JSON.stringify(subscription));

                            }                            

                        } else {

                            console.dir(err);

                        } 
                        
                        callback(null);

                });	                        

            } else {
                
                if(err) {
                
                    console.dir(err);
                
                    callback(err);
                    
                } else {
                    
                    callback('Failed to create subscription for userid : ' + userid + ' | subscriptionPlanId : ' + subscriptionPlanId);
                    
                }

            }

    });	    
    
}

/***********************************************
*
* get braintree token to initiate a payment
*
***********************************************/
app.get("/client_token", function (req, res) {

  gateway.clientToken.generate({}, function (err, response) {
  
    res.send(response.clientToken);
    
  });
  
});

app.post("/save-subscription", function (req, res) {

	var name = req.body.name, 
        email = req.body.email, 
        subscriptionPlanId = req.body.subscriptionPlanId,
        nonce = req.body.nonce;
    
    // check if email exist
    dbCollectionsUser.findOne({email:email}, {email:1,subscription:1},function(err, user) {

        if(user) { // exisiting user in your database
            
            var userSubsciptionExistInDb = false;
            
            if(user.subscription) {

                userSubsciptionExistInDb = true;

            }            
            
            // check if this user is also one of your customer in braintree
            gateway.customer.find(user._id.toString(), function(err, customer) {               

                if(customer) { // customer already exist in your braintree account
                    
                    var userSubsciptionExistInBraintree = false, paymentMethodToken;

                    for(var i = 0;i<customer.creditCards.length;i++){
                        
                        for(var j = 0;j<customer.creditCards[i].subscriptions.length;j++){

                            if(customer.creditCards[i].subscriptions[j].planId === subscriptionPlanId && 
                                    customer.creditCards[i].subscriptions[j].status.toLowerCase() === "active") {
                                
                                userSubsciptionExistInBraintree = true;
                                
                                break;
                                
                            }
                        
                        }
                           
                    }
                    
                    if(userSubsciptionExistInBraintree) {
                        
                        res.jsonp({status:200,text:'You have already subscribed to our amazing service :D'});
                        
                        return;                         
                        
                    }
                    
                    if(customer.paymentMethod && 
                        !customer.paymentMethod.expired &&
                         customer.paymentMethod.default) {
                        
                        paymentMethodToken = customer.paymentMethod.token;
                        
                    } else {
                        
                        if(customer.paymentMethods) {
                            
                            for(var i = 0;i<customer.paymentMethods.length;i++){
                                
                                if(!customer.paymentMethods[i].expired && 
                                    customer.paymentMethods[i].default) {
                                    
                                    paymentMethodToken = customer.paymentMethods[i].token;
                                    
                                    break;
                                    
                                }
                                
                            }                             
                            
                        }
                        
                    }

                    if(paymentMethodToken) {

                        createBraintreeSubscriptionAndUpdateDb(paymentMethodToken, subscriptionPlanId, user._id, userSubsciptionExistInDb, function(err){

                            if(!err) {

                                res.jsonp({status:200,text:'Thanks for subscribing to our amazing service :D'});

                            } else {

                                res.jsonp({status:400,text:'Opps ... there is some problem subscribing you to our amazing service :('});

                            }

                        });
                        
                    } else { // create a new payment method
                        
                        // create a payment method for new customer in braintree
                        gateway.paymentMethod.create({
                          customerId: user._id.toString(),
                          paymentMethodNonce: nonce
                        }, function (err, resultPaymentMethod) { 
                            
                            if(!err && resultPaymentMethod) {
                                
                                createBraintreeSubscriptionAndUpdateDb(resultPaymentMethod.paymentMethod.token, subscriptionPlanId, user._id, userSubsciptionExistInDb, function(err){

                                    if(!err) {

                                        res.jsonp({status:200,text:'Thanks for subscribing to our amazing service :D'});

                                    } else {

                                        res.jsonp({status:400,text:'Opps ... there is some problem subscribing you to our amazing service :('});

                                    }

                                });                                
                                
                            } else {
                                
                                console.dir(err);
                                
                                res.jsonp({status:400,text:'Opps ... there is some problem subscribing you to our amazing service :('});
                                
                            }

                        });
                        
                    }
                    
                } else { // customer doesn't exist in braintree account but exist in your database
                    
                    // create this customer in braintree account
                    gateway.customer.create({
                      firstName: name,  
                      email: email,
                      id:user._id.toString()
                    }, function (err, customer) {

                        if(customer.success) {	
                            
                            // create a payment method for new customer in braintree
                            gateway.paymentMethod.create({
                              customerId: user._id.toString(),
                              paymentMethodNonce: nonce
                            }, function (err, resultPaymentMethod) { 

                                if(!err) {
                                    
                                    createBraintreeSubscriptionAndUpdateDb(resultPaymentMethod.paymentMethod.token, subscriptionPlanId, user._id, userSubsciptionExistInDb, function(err){

                                        if(!err) {

                                            res.jsonp({status:200,text:'Thanks for subscribing to our amazing service :D'});

                                        } else {

                                            res.jsonp({status:400,text:'Opps ... there is some problem subscribing you to our amazing service :('});

                                        }

                                    });                                                                

                                } else {
                                    
                                    console.dir(err);
                                    
                                    res.jsonp({status:400,text:'Opps ... there is some problem subscribing you to our amazing service :('});
                                    
                                }

                            });	                          

                        } else { // failed to create customer in braintree account

                            res.jsonp({status:400,text:'Opps ... there is some problem subscribing you to our amazing service :('});

                        }

                    });                     
                                        
                }

            });            

        } else { // user doesn't exist in your database and it's a new user

            dbCollectionsUser.save(
                {
                    name:name, 
                    email:email, 
                    date_created:new Date()
                }, 
                {w:1}, 
                function(err, savedNewUser) {

                    if(err) {

                        console.dir(err);	

                        res.jsonp({status:400,text:'Opps ... there is some problem with our system :('});

                    } else {
                        
                        // create this new customer in braintree account
                        gateway.customer.create({
                          firstName: name,  
                          email: email,
                          id:savedNewUser.ops[0]._id.toString()
                        }, function (err, customer) {

                            if(customer.success) {	
                                
                                // create a payment method for new customer in braintree
                                gateway.paymentMethod.create({
                                  customerId: savedNewUser.ops[0]._id.toString(),
                                  paymentMethodNonce: nonce
                                }, function (err, resultPaymentMethod) { 

                                    if(!err && resultPaymentMethod) {

                                        gateway.subscription.create({
                                            paymentMethodToken: resultPaymentMethod.paymentMethod.token,
                                            planId: subscriptionPlanId,
                                            merchantAccountId: 'merchantAccountIdUSD'
                                            //firstBillingDate: '2016-03-01'
                                            }, 
                                            function (err, result) {

                                                if(!err && result.success) {
                                                    
                                                    var subscription = {
                                                        
                                                        // save subscription id for querying or cancelling in future
                                                        id:result.subscription.id,
                                                        planid:subscriptionPlanId,
                                                        date_subscribed:new Date()

                                                    }, arr = [];                                                    
                                                    
                                                    arr.push(subscription);
                                                    
                                                    dbCollectionsUser.update(
                                                        {_id:savedNewUser.ops[0]._id},
                                                        {$set:{subscription:arr}}, 
                                                        {w:1}, 
                                                        function(err, result) {

                                                            if(!err) {

                                                                if(result.result.nModified < 1) {

                                                                    console.log('Failed to update subscription for userid : ' + savedNewUser.ops[0]._id.toString() + ' | ' + JSON.stringify(subscription));

                                                                }                            

                                                            } else {

                                                                console.dir(err);

                                                            } 

                                                    });	                                                    

                                                    res.jsonp({status:200,text:'Thanks for subscribing to our amazing service :D'});

                                                } else {

                                                    console.dir(err);

                                                    res.jsonp({status:400,text:'Opps ... there is some problem subscribing you to our amazing service :('});

                                                }

                                        });	                                                               

                                    } else {

                                        console.dir(err);

                                        res.jsonp({status:400,text:'Opps ... there is some problem subscribing you to our amazing service :('});

                                    }

                                });

                            } else {

                                res.jsonp({status:400,text:'Opps ... there is some problem subscribing you to our amazing service :('});
                            }
                            
                        });                        

                    } 

            });	

        }

    });

});