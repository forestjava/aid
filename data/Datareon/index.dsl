
entity Route {
  type Message;

  attribute id {
    type UUID;

  }

  attribute name {
    type String;
  };

  attribute orders {
    type "Message.Order[]";

  };

}

entity Order {
  type Message;

  attribute id {
    type UUID;

  };

  attribute name {
    type String;
  };

  attribute route {
    type "Message.Route";

  };
  
}

entity Wagon {
  type Message;

  attribute id {};
  attribute name {};
}

entity Good {
  type Message;

  attribute id {};
  attribute name {};
}
