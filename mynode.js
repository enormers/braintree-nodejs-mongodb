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

app.post("/save-payment", function (req, res) {

	var name = req.body.name, email = req.body.email, amount = req.body.amount, nonce = req.body.nonce;
	
	gateway.transaction.sale({
	  amount: amount,
	  paymentMethodNonce: nonce,
	}, function (err, result) {
	
		if(!err) {
		
			if(result.success) { // insert a record into user collection is success
                
                // check if email exist.
                dbCollectionsUser.findOne({email:email}, {email:1},function(err, user) {
                    
                    if(user) { // exisiting user
                        
                        var payment = {date_paid:new Date(), amount:result.transaction.amount, txnid:result.transaction.id};
                        
                        dbCollectionsUser.update(
                            {_id:user._id},
                            {$push:{payment:payment}}, 
                            {w:1}, 
                            function(err, result) {

                                if(err) {

                                    console.dir(err);	

                                } else {
                                    
                                    if(result.result.nModified < 1) {
                                        
                                        console.log('Failed to update payment for userid : ' + user._id);
                                        console.dir(payment);
                                        
                                    }
                                    
                                } 

                        });	                        
                        
                    } else { // new user
                        
                        var payment = [];
                        
                        payment.push({date_paid:new Date(), amount:result.transaction.amount, txnid:result.transaction.id});
                        
                        dbCollectionsUser.insert(
                            {name:name, email:email, date_created:new Date(), payment:payment}, 
                            {w:1}, 
                            function(err, result) {

                                if(err) {

                                    console.dir(err);	

                                } 

                        });	

                    }
                    
                });
			
				res.jsonp({status:200,text:'Thank you for your money :) Refresh browser to make new payment'});
			
			} else {
			
				res.jsonp({status:400,text:'Failed to make payment :( \n' + result.message});
			
			}		
		
		} else {
		
			res.jsonp({status:400,text:'Failed to make payment :(\n' + err});
			
			console.dir(err);
		
		}
	
	});	


});