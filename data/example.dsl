// Пример файла DSL для тестирования

сущность "Пользователь" {
  реквизит Имя;
  реквизит Фамилия;
  реквизит Email;
};

entity User {
  attribute FirstName;
  attribute LastName;
  attribute Email;
};

type "Строка";
type "Число";

service UserService {
  entity "GetUser";
  entity "CreateUser";
};

